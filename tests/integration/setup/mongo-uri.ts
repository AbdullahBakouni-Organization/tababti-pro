/**
 * Standalone URI helper — no external imports so this file is safe to use
 * from globalSetup / globalTeardown, which run before Jest's moduleNameMapper
 * is applied and therefore cannot resolve @app/common/* path aliases.
 *
 * Problem this solves:
 *   mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true
 *   + naively appending "/mydb" →
 *   mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true/mydb
 *   The driver reads "true/mydb" as the value of directConnection and throws
 *   "directConnection must be either true or false".
 */
export function buildMongoUri(baseUri: string, dbName: string): string {
  // Split off query string first
  const [uriPart, queryPart] = baseUri.split('?') as [
    string,
    string | undefined,
  ];

  // Isolate the scheme (e.g. "mongodb://") from the authority+path
  const schemeEnd = uriPart.indexOf('://');
  if (schemeEnd === -1) {
    // Not a standard URI — fall back to simple append
    const sep = uriPart.endsWith('/') ? '' : '/';
    return queryPart !== undefined
      ? `${uriPart}${sep}${dbName}?${queryPart}`
      : `${uriPart}${sep}${dbName}`;
  }

  const scheme = uriPart.slice(0, schemeEnd + 3); // e.g. "mongodb://"
  const rest = uriPart.slice(schemeEnd + 3); // e.g. "user:pass@host:27017/existingDb"

  // Strip any existing db name — the first "/" in `rest` separates host:port from db
  const slashIdx = rest.indexOf('/');
  const authority = slashIdx === -1 ? rest : rest.slice(0, slashIdx);

  return queryPart !== undefined
    ? `${scheme}${authority}/${dbName}?${queryPart}`
    : `${scheme}${authority}/${dbName}`;
}
