import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pg from 'pg';

export interface GameData {
  accounts: Record<string, unknown>;
  rooms: Record<string, Record<string, number>>;
}

export interface Storage {
  readonly kind: string;
  load(): Promise<GameData>;
  save(data: GameData): Promise<void>;
}

/** JSON files in a directory; survives restarts only where the disk does. */
export class FileStorage implements Storage {
  readonly kind: string;
  constructor(private dir: string) {
    this.kind = `files in ${dir}`;
  }

  private read<T>(name: string, fallback: T): T {
    const f = join(this.dir, name);
    try {
      return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : fallback;
    } catch (e) {
      console.error(`could not read ${f}`, e);
      return fallback;
    }
  }

  private write(name: string, value: unknown): void {
    const f = join(this.dir, name);
    mkdirSync(dirname(f), { recursive: true });
    // Write then rename so a crash mid-write cannot corrupt the save.
    writeFileSync(`${f}.tmp`, JSON.stringify(value));
    renameSync(`${f}.tmp`, f);
  }

  async load(): Promise<GameData> {
    return { accounts: this.read('accounts.json', {}), rooms: this.read('rooms.json', {}) };
  }

  async save(data: GameData): Promise<void> {
    this.write('accounts.json', data.accounts);
    this.write('rooms.json', data.rooms);
  }
}

/** Postgres (any host: Render, Neon, Supabase...) keeps progress across deploys with no disk. */
export class PgStorage implements Storage {
  readonly kind = 'Postgres';
  private pool: pg.Pool;
  constructor(url: string) {
    const local = /localhost|127\.0\.0\.1/.test(url);
    this.pool = new pg.Pool({ connectionString: url, max: 3, ssl: local ? undefined : { rejectUnauthorized: false } });
  }

  async load(): Promise<GameData> {
    await this.pool.query('CREATE TABLE IF NOT EXISTS game_state (key text PRIMARY KEY, value jsonb NOT NULL)');
    const { rows } = await this.pool.query('SELECT key, value FROM game_state');
    const get = (k: string) => rows.find((r) => r.key === k)?.value ?? {};
    return { accounts: get('accounts'), rooms: get('rooms') };
  }

  async save(data: GameData): Promise<void> {
    const sql = 'INSERT INTO game_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value';
    await this.pool.query(sql, ['accounts', JSON.stringify(data.accounts)]);
    await this.pool.query(sql, ['rooms', JSON.stringify(data.rooms)]);
  }
}

export function createStorage(env: NodeJS.ProcessEnv, defaultDir: string): Storage {
  if (env.DATABASE_URL) return new PgStorage(env.DATABASE_URL);
  return new FileStorage(env.DATA_DIR || defaultDir);
}
