/**
 * Safely parse a JSON string, returning `undefined` for null/undefined/empty
 * values, or the provided fallback for malformed JSON.
 */
export function safeParseJson(
  value: string | null | undefined,
  fallback: unknown = {}
): unknown {
  if (value == null || value === '') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
