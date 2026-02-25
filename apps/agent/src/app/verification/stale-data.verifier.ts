import {
  ToolCallRecord,
  Verifier,
  VerificationResult
} from '../common/interfaces';

// Stale data: any tool result with fetchedAt > 24h old triggers a warning.
// Parses ToolResult.fetchedAt from each successful tool call result.
// This is a WARNING — does not short-circuit the pipeline.

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

function extractFetchedAt(
  toolCalls: ToolCallRecord[]
): { toolName: string; fetchedAt: Date; ageMs: number }[] {
  const entries: { toolName: string; fetchedAt: Date; ageMs: number }[] = [];
  const now = Date.now();

  for (const tc of toolCalls) {
    if (!tc.success) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(tc.result);
    } catch {
      continue;
    }

    const toolResult = parsed as { fetchedAt?: string };

    if (!toolResult?.fetchedAt) continue;

    const fetchedAt = new Date(toolResult.fetchedAt);
    if (isNaN(fetchedAt.getTime())) continue;

    entries.push({
      toolName: tc.toolName,
      fetchedAt,
      ageMs: now - fetchedAt.getTime()
    });
  }

  return entries;
}

function formatAge(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export class StaleDataVerifier implements Verifier {
  name = 'stale_data';
  order = 'A-0003';

  async verify(
    _response: string,
    toolCalls: ToolCallRecord[],
    _channel?: string // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<VerificationResult> {
    const warnings: string[] = [];
    const flags: string[] = [];

    const entries = extractFetchedAt(toolCalls);

    // No timestamped data — nothing to verify
    if (entries.length === 0) {
      return { pass: true, warnings: [], flags: [] };
    }

    const stale = entries.filter((e) => e.ageMs > STALE_THRESHOLD_MS);

    for (const s of stale) {
      warnings.push(
        `Stale data: ${s.toolName} data is ${formatAge(s.ageMs)} old (threshold: 24h)`
      );
    }

    return {
      pass: true, // warnings only — stale data doesn't hard-fail
      warnings,
      flags
    };
  }
}
