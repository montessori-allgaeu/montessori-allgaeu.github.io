// Synchronous SQL operations keep credential counters, invitations and role changes atomic.
export class Store {
  constructor(private sql: SqlStorage) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER)",
    );
    sql.exec("CREATE INDEX IF NOT EXISTS state_expiry ON state(expires)");
  }
  get<T>(key: string): T | undefined {
    const row = this.sql
      .exec<{ value: string }>(
        "SELECT value FROM state WHERE key = ? AND (expires IS NULL OR expires > ?)",
        key,
        Date.now(),
      )
      .toArray()[0];
    return row ? (JSON.parse(row.value) as T) : undefined;
  }
  put<T>(key: string, value: T, expires?: number) {
    this.sql.exec(
      "INSERT INTO state(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires=excluded.expires",
      key,
      JSON.stringify(value),
      expires ?? null,
    );
  }
  delete(key: string) {
    this.sql.exec("DELETE FROM state WHERE key = ?", key);
  }
  list<T>(prefix: string): [string, T][] {
    return this.sql
      .exec<{ key: string; value: string }>(
        "SELECT key,value FROM state WHERE key >= ? AND key < ? AND (expires IS NULL OR expires > ?) ORDER BY key",
        prefix,
        `${prefix}\uffff`,
        Date.now(),
      )
      .toArray()
      .map((r) => [r.key, JSON.parse(r.value) as T]);
  }
  clean() {
    this.sql.exec("DELETE FROM state WHERE expires IS NOT NULL AND expires <= ?", Date.now());
  }
}
