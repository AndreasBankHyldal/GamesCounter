import pg from "pg";
import { Async } from "boardgame.io/internal";
import type { LogEntry, Server, State, StorageAPI } from "boardgame.io";

const { Pool } = pg;

/** Render Postgres needs SSL; a local database typically does not. */
function sslFor(connectionString: string): pg.PoolConfig["ssl"] {
  return /localhost|127\.0\.0\.1/.test(connectionString)
    ? false
    : { rejectUnauthorized: false };
}

/**
 * Minimal Postgres storage adapter for boardgame.io (implements the Async
 * StorageAPI). One row per match; state/metadata/log are JSONB, with
 * game_name / is_gameover / updated_at mirrored into columns for fast,
 * portable listMatches filtering. Accepts a connection string or an existing
 * Pool (the latter is used by tests).
 */
export class PostgresStore extends Async {
  private pool: pg.Pool;

  constructor(arg: string | pg.Pool) {
    super();
    this.pool =
      typeof arg === "string"
        ? new Pool({ connectionString: arg, ssl: sslFor(arg) })
        : arg;
  }

  async connect(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS bgio_matches (
        id TEXT PRIMARY KEY,
        game_name TEXT NOT NULL,
        state JSONB NOT NULL,
        initial_state JSONB NOT NULL,
        metadata JSONB NOT NULL,
        log JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_gameover BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at BIGINT NOT NULL
      );
    `);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS bgio_matches_game_idx ON bgio_matches (game_name);`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS bgio_matches_updated_idx ON bgio_matches (updated_at);`
    );
  }

  async createMatch(
    matchID: string,
    opts: StorageAPI.CreateMatchOpts
  ): Promise<void> {
    const m = opts.metadata;
    await this.pool.query(
      `INSERT INTO bgio_matches
         (id, game_name, state, initial_state, metadata, log, is_gameover, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, '[]'::jsonb, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         game_name = EXCLUDED.game_name,
         state = EXCLUDED.state,
         initial_state = EXCLUDED.initial_state,
         metadata = EXCLUDED.metadata,
         is_gameover = EXCLUDED.is_gameover,
         updated_at = EXCLUDED.updated_at`,
      [
        matchID,
        m.gameName,
        JSON.stringify(opts.initialState),
        JSON.stringify(opts.initialState),
        JSON.stringify(m),
        m.gameover !== undefined,
        m.updatedAt ?? Date.now(),
      ]
    );
  }

  async setState(
    matchID: string,
    state: State,
    deltalog?: LogEntry[]
  ): Promise<void> {
    if (deltalog && deltalog.length > 0) {
      const { rows } = await this.pool.query(
        `SELECT log FROM bgio_matches WHERE id = $1`,
        [matchID]
      );
      const existing: LogEntry[] = rows[0]?.log ?? [];
      const log = [...existing, ...deltalog];
      await this.pool.query(
        `UPDATE bgio_matches SET state = $2::jsonb, log = $3::jsonb, updated_at = $4 WHERE id = $1`,
        [matchID, JSON.stringify(state), JSON.stringify(log), Date.now()]
      );
    } else {
      await this.pool.query(
        `UPDATE bgio_matches SET state = $2::jsonb, updated_at = $3 WHERE id = $1`,
        [matchID, JSON.stringify(state), Date.now()]
      );
    }
  }

  async setMetadata(matchID: string, metadata: Server.MatchData): Promise<void> {
    await this.pool.query(
      `UPDATE bgio_matches
         SET metadata = $2::jsonb, game_name = $3, is_gameover = $4, updated_at = $5
       WHERE id = $1`,
      [
        matchID,
        JSON.stringify(metadata),
        metadata.gameName,
        metadata.gameover !== undefined,
        metadata.updatedAt ?? Date.now(),
      ]
    );
  }

  async fetch<O extends StorageAPI.FetchOpts>(
    matchID: string,
    opts: O
  ): Promise<StorageAPI.FetchResult<O>> {
    const cols: string[] = [];
    if (opts.state) cols.push("state");
    if (opts.metadata) cols.push("metadata");
    if (opts.log) cols.push("log");
    if (opts.initialState) cols.push("initial_state");

    const result: Record<string, unknown> = {};
    if (cols.length === 0) return result as StorageAPI.FetchResult<O>;

    const { rows } = await this.pool.query(
      `SELECT ${cols.join(", ")} FROM bgio_matches WHERE id = $1`,
      [matchID]
    );
    const row = rows[0];
    if (row) {
      if (opts.state) result.state = row.state;
      if (opts.metadata) result.metadata = row.metadata;
      if (opts.log) result.log = row.log ?? [];
      if (opts.initialState) result.initialState = row.initial_state;
    }
    return result as StorageAPI.FetchResult<O>;
  }

  async wipe(matchID: string): Promise<void> {
    await this.pool.query(`DELETE FROM bgio_matches WHERE id = $1`, [matchID]);
  }

  async listMatches(opts?: StorageAPI.ListMatchesOpts): Promise<string[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: (i: number) => string, value: unknown) => {
      params.push(value);
      where.push(clause(params.length));
    };
    if (opts?.gameName !== undefined) add((i) => `game_name = $${i}`, opts.gameName);
    if (opts?.where?.isGameover !== undefined)
      add((i) => `is_gameover = $${i}`, opts.where.isGameover);
    if (opts?.where?.updatedBefore !== undefined)
      add((i) => `updated_at < $${i}`, opts.where.updatedBefore);
    if (opts?.where?.updatedAfter !== undefined)
      add((i) => `updated_at > $${i}`, opts.where.updatedAfter);

    const sql =
      `SELECT id FROM bgio_matches` +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "");
    const { rows } = await this.pool.query(sql, params);
    return rows.map((r) => r.id as string);
  }

  /** Close the pool (graceful shutdown / tests). */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
