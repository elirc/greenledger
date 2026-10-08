/** All PKs are UUIDs; offline clients generate their own. */
export function newId(): string {
  return crypto.randomUUID();
}
