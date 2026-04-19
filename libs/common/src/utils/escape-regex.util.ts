/**
 * Escape characters that carry meaning inside a regular expression so a
 * user-supplied string can be used safely in `$regex` / `new RegExp()`.
 *
 * Required for every user-controlled value reaching a Mongo `$regex` clause:
 * without escaping, an input like `.*` is evaluated as a wildcard and
 * inputs like `(a|b){100}(a|b){100}` can trigger catastrophic backtracking
 * (ReDoS).
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
