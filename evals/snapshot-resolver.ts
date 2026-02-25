// Resolves {{snapshot:*}} and {{seed:*}} templates in eval assertion values.
// snapshot templates resolve against a live PortfolioSnapshot (market-dynamic).
// seed templates resolve against evals/seed-manifest.json (seed-stable).
import * as fs from 'fs';
import * as path from 'path';

import { PortfolioSnapshot } from './snapshot';

const TEMPLATE_RE = /\{\{snapshot:(.+?)\}\}/;
const SEED_TEMPLATE_RE = /\{\{seed:(.+?)\}\}/;

// ── Seed manifest ────────────────────────────────────────────

let _seedManifest: Record<string, unknown> | null = null;

function loadSeedManifest(): Record<string, unknown> {
  if (_seedManifest) return _seedManifest;
  const manifestPath = path.resolve(__dirname, 'seed-manifest.json');
  _seedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return _seedManifest!;
}

/**
 * Resolve a dotted path with optional array indexing against the seed manifest.
 * Supports: "holdings.equities[0]", "quantities.AAPL.current", "totals.dividends", "currency"
 */
function resolveSeedPath(seedPath: string): string | null {
  const manifest = loadSeedManifest();

  // Split on dots, then handle array indices within each segment
  const segments = seedPath.split('.');
  let current: unknown = manifest;

  for (const segment of segments) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object'
    ) {
      return null;
    }

    // Check for array index: e.g. "equities[0]"
    const arrayMatch = segment.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const obj = (current as Record<string, unknown>)[key];
      if (!Array.isArray(obj)) return null;
      const index = parseInt(indexStr, 10);
      if (index < 0 || index >= obj.length) return null;
      current = obj[index];
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }

  if (current === null || current === undefined) return null;
  // Arrays are not valid as assertion substrings
  if (Array.isArray(current)) return null;

  return String(current);
}

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
 * If the value contains a {{snapshot:*}} or {{seed:*}} template, resolve it.
 * Snapshot templates resolve against the live PortfolioSnapshot.
 * Seed templates resolve against evals/seed-manifest.json.
 * Returns the resolved string and whether resolution was skipped
 * (missing data). Non-template values pass through unchanged.
 */
export function resolveValue(
  value: string,
  snapshot: PortfolioSnapshot | null
): ResolveResult {
  // Try seed template first
  const seedMatch = value.match(SEED_TEMPLATE_RE);
  if (seedMatch) {
    const resolved = resolveSeedPath(seedMatch[1]);
    if (resolved === null) return { value, skipped: true };
    // Replace and recurse in case there are multiple templates
    const replaced = value.replace(SEED_TEMPLATE_RE, resolved);
    // Check if there are more templates to resolve
    if (SEED_TEMPLATE_RE.test(replaced) || TEMPLATE_RE.test(replaced)) {
      return resolveValue(replaced, snapshot);
    }
    return { value: replaced, skipped: false };
  }

  // Then try snapshot template
  const match = value.match(TEMPLATE_RE);
  if (!match) return { value, skipped: false };

  if (!snapshot) return { value, skipped: true };

  const resolved = resolveSnapshotPath(snapshot, match[1]);
  if (resolved === null) return { value, skipped: true };

  // Replace template with resolved value (supports templates embedded in larger strings)
  const replaced = value.replace(TEMPLATE_RE, resolved);
  // Check if there are more templates to resolve
  if (SEED_TEMPLATE_RE.test(replaced) || TEMPLATE_RE.test(replaced)) {
    return resolveValue(replaced, snapshot);
  }
  return { value: replaced, skipped: false };
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
