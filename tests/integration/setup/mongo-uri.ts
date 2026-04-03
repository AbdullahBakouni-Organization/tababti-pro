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
  if (baseUri.includes('?')) {
    const [hostPart, queryPart] = baseUri.split('?');
    const cleanHost = hostPart.replace(/\/$/, '');
    return `${cleanHost}/${dbName}?${queryPart}`;
  }
  const sep = baseUri.endsWith('/') ? '' : '/';
  return `${baseUri}${sep}${dbName}`;
}
