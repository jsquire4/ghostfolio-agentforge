// Portfolio snapshot — calls Ghostfolio API directly (no LLM) to establish
// ground truth before eval runs. Shows exactly what data the agent has access
// to, so instructors can verify responses against known facts.

const GHOSTFOLIO_URL =
  process.env.GHOSTFOLIO_BASE_URL || 'http://localhost:3333';

// ── ANSI Helpers ────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

// ── Types ───────────────────────────────────────────────────

interface Holding {
  name: string;
  symbol: string;
  currency: string;
  assetClass: string;
  quantity: number;
  marketPrice: number;
  allocationInPercentage: number;
  valueInBaseCurrency: number;
  netPerformancePercent: number;
}

interface Performance {
  currentNetWorth?: number;
  currentValueInBaseCurrency: number;
  totalInvestment: number;
  netPerformance: number;
  netPerformancePercentage: number;
}

interface ReportRule {
  key: string;
  name: string;
  isActive: boolean;
  value: boolean; // pass/fail
}

export interface PortfolioSnapshot {
  timestamp: string;
  holdings: Holding[];
  performance: Performance | null;
  reportRules: ReportRule[];
  aiPrompt: string | null;
  errors: string[];
}

// ── API Helpers ─────────────────────────────────────────────

async function gfGet<T>(path: string, jwt: string): Promise<T> {
  const response = await fetch(`${GHOSTFOLIO_URL}${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ── Snapshot Builder ────────────────────────────────────────

export async function captureSnapshot(jwt: string): Promise<PortfolioSnapshot> {
  const errors: string[] = [];
  let holdings: Holding[] = [];
  let performance: Performance | null = null;
  let reportRules: ReportRule[] = [];
  let aiPrompt: string | null = null;

  // Holdings
  try {
    const data = await gfGet<{
      holdings: {
        name: string;
        symbol: string;
        currency: string;
        assetClass: string;
        quantity: number;
        marketPrice: number;
        allocationInPercentage: number;
        valueInBaseCurrency: number;
        netPerformancePercent: number;
      }[];
    }>('/api/v1/portfolio/holdings', jwt);
    holdings = data.holdings.map((h) => ({
      name: h.name,
      symbol: h.symbol,
      currency: h.currency,
      assetClass: h.assetClass,
      quantity: h.quantity,
      marketPrice: h.marketPrice,
      allocationInPercentage: h.allocationInPercentage,
      valueInBaseCurrency: h.valueInBaseCurrency,
      netPerformancePercent: h.netPerformancePercent
    }));
  } catch (err) {
    errors.push(
      `Holdings: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Performance
  try {
    const data = await gfGet<{
      performance: Performance;
    }>('/api/v2/portfolio/performance?range=max', jwt);
    performance = data.performance;
  } catch (err) {
    errors.push(
      `Performance: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Risk report / X-Ray
  try {
    const data = await gfGet<{
      xRay: {
        categories: {
          key: string;
          name: string;
          rules: {
            key: string;
            name: string;
            isActive: boolean;
            value: boolean;
          }[];
        }[];
      };
    }>('/api/v1/portfolio/report', jwt);
    for (const cat of data.xRay.categories) {
      for (const rule of cat.rules) {
        reportRules.push({
          key: rule.key,
          name: rule.name,
          isActive: rule.isActive,
          value: rule.value
        });
      }
    }
  } catch (err) {
    errors.push(`Report: ${err instanceof Error ? err.message : String(err)}`);
  }

  // AI prompt (what the tool actually sends to the LLM)
  try {
    const data = await gfGet<{ prompt: string }>(
      '/api/v1/ai/prompt/analysis',
      jwt
    );
    aiPrompt = data.prompt;
  } catch (err) {
    errors.push(
      `AI Prompt: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    timestamp: new Date().toISOString(),
    holdings,
    performance,
    reportRules,
    aiPrompt,
    errors
  };
}

// ── CLI Display ─────────────────────────────────────────────

function fmtDollar(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

export function printSnapshot(snap: PortfolioSnapshot): void {
  console.log(`\n${BOLD} Portfolio Snapshot ${DIM}(ground truth)${RESET}`);
  console.log('\u2500'.repeat(61));

  if (snap.errors.length > 0) {
    for (const err of snap.errors) {
      console.log(`  ${RED}!${RESET} ${err}`);
    }
    console.log('');
  }

  // Performance summary
  if (snap.performance) {
    const p = snap.performance;
    console.log(
      `  ${CYAN}Net Worth:${RESET}  ${fmtDollar(p.currentNetWorth ?? p.currentValueInBaseCurrency)}`
    );
    console.log(`  ${CYAN}Invested:${RESET}   ${fmtDollar(p.totalInvestment)}`);
    console.log(
      `  ${CYAN}Net P&L:${RESET}    ${fmtDollar(p.netPerformance)} (${fmtPct(p.netPerformancePercentage)})`
    );
  }

  // Top 5 holdings
  if (snap.holdings.length > 0) {
    const sorted = [...snap.holdings].sort(
      (a, b) => b.allocationInPercentage - a.allocationInPercentage
    );
    const top5 = sorted.slice(0, 5);
    console.log(`  ${CYAN}Holdings:${RESET}   ${snap.holdings.length} total`);
    for (const h of top5) {
      const alloc = (h.allocationInPercentage * 100).toFixed(1);
      const perfColor = h.netPerformancePercent >= 0 ? GREEN : RED;
      console.log(
        `    ${DIM}${alloc.padStart(5)}%${RESET}  ${h.symbol.padEnd(6)} ${fmtDollar(h.valueInBaseCurrency).padStart(12)}  ${perfColor}${fmtPct(h.netPerformancePercent)}${RESET}`
      );
    }
  }

  console.log('\u2500'.repeat(61));
}
