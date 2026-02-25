// Resolves {{snapshot:*}} templates in eval assertion values against a live
// PortfolioSnapshot. Keeps eval JSON files stable across market price changes.
import { PortfolioSnapshot } from './snapshot';

const TEMPLATE_RE = /\{\{snapshot:(.+?)\}\}/;

// ── Formatters ───────────────────────────────────────────────

function fmtDollar(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ── Path resolver ────────────────────────────────────────────

function resolveSnapshotPath(
  snapshot: PortfolioSnapshot,
  path: string
): string | null {
  // holdings.<SYMBOL>.<field>
  const holdingMatch = path.match(/^holdings\.([A-Z]+)\.(\w+)$/);
  if (holdingMatch) {
    const [, symbol, field] = holdingMatch;
    const holding = snapshot.holdings.find((h) => h.symbol === symbol);
    if (!holding) return null;

    switch (field) {
      case 'quantity':
        return String(holding.quantity);
      case 'marketPrice':
        return fmtDollar(holding.marketPrice);
      case 'value':
        return fmtDollar(holding.valueInBaseCurrency);
      case 'allocation':
        return fmtPercent(holding.allocationInPercentage);
      case 'performance':
        return fmtPercent(holding.netPerformancePercent);
      default:
        return null;
    }
  }

  // performance.<field>
  const perfMatch = path.match(/^performance\.(\w+)$/);
  if (perfMatch && snapshot.performance) {
    const [, field] = perfMatch;
    const p = snapshot.performance;
    switch (field) {
      case 'netWorth':
        return fmtDollar(p.currentNetWorth ?? p.currentValueInBaseCurrency);
      case 'invested':
        return fmtDollar(p.totalInvestment);
      case 'netPnl':
        return fmtDollar(p.netPerformance);
      case 'netPnlPct':
        return fmtPercent(p.netPerformancePercentage);
      default:
        return null;
    }
  }

  return null;
}

// ── Public API ───────────────────────────────────────────────

export interface ResolveResult {
  value: string;
  skipped: boolean; // true if template could not be resolved
}

/**
 * If the value contains a {{snapshot:*}} template, resolve it against the
 * snapshot. Returns the resolved string and whether resolution was skipped
 * (missing snapshot data). Non-template values pass through unchanged.
 */
export function resolveValue(
  value: string,
  snapshot: PortfolioSnapshot | null
): ResolveResult {
  const match = value.match(TEMPLATE_RE);
  if (!match) return { value, skipped: false };

  if (!snapshot) return { value, skipped: true };

  const resolved = resolveSnapshotPath(snapshot, match[1]);
  if (resolved === null) return { value, skipped: true };

  // Replace template with resolved value (supports templates embedded in larger strings)
  return {
    value: value.replace(TEMPLATE_RE, resolved),
    skipped: false
  };
}

/**
 * Resolve all template values in an array. Returns resolved values and
 * a list of warnings for any templates that could not be resolved.
 */
export function resolveArray(
  values: string[],
  snapshot: PortfolioSnapshot | null
): { resolved: string[]; warnings: string[] } {
  const resolved: string[] = [];
  const warnings: string[] = [];

  for (const v of values) {
    const result = resolveValue(v, snapshot);
    if (result.skipped) {
      warnings.push(`Skipped unresolvable template: ${v}`);
    } else {
      resolved.push(result.value);
    }
  }

  return { resolved, warnings };
}
