import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), ".twitter");
const DB_PATH = join(DATA_DIR, "twitter.db");

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.run("PRAGMA journal_mode = WAL");
  _db.run("PRAGMA foreign_keys = ON");
  migrate(_db);
  return _db;
}

/** For tests — use an in-memory database */
export function getTestDb(): Database {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

function migrate(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS tweets (
      id         TEXT PRIMARY KEY,
      content    TEXT NOT NULL,
      thread_id  TEXT,
      thread_pos INTEGER DEFAULT 0,
      status     TEXT DEFAULT 'draft',
      tweet_id   TEXT,
      posted_at  TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      tags       TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS generations (
      id         TEXT PRIMARY KEY,
      prompt     TEXT NOT NULL,
      output     TEXT NOT NULL,
      model      TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

// --- ID generation (nanoid-like, no deps) ---

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function newId(size = 12): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < size; i++) {
    id += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return id;
}

// --- Tweet CRUD ---

export type Tweet = {
  id: string;
  content: string;
  thread_id: string | null;
  thread_pos: number;
  status: "draft" | "posted" | "failed";
  tweet_id: string | null;
  posted_at: string | null;
  created_at: string;
  tags: string | null;
};

export type TweetInsert = {
  content: string;
  thread_id?: string;
  thread_pos?: number;
  status?: Tweet["status"];
  tags?: string;
};

export function createTweet(db: Database, data: TweetInsert): Tweet {
  const id = newId();
  db.run(
    `INSERT INTO tweets (id, content, thread_id, thread_pos, status, tags)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.content,
      data.thread_id ?? null,
      data.thread_pos ?? 0,
      data.status ?? "draft",
      data.tags ?? null,
    ],
  );
  return getTweet(db, id)!;
}

export function getTweet(db: Database, id: string): Tweet | null {
  return db.query("SELECT * FROM tweets WHERE id = ?").get(id) as Tweet | null;
}

export function listTweets(db: Database, status?: Tweet["status"]): Tweet[] {
  if (status) {
    return db.query("SELECT * FROM tweets WHERE status = ? ORDER BY created_at DESC").all(status) as Tweet[];
  }
  return db.query("SELECT * FROM tweets ORDER BY created_at DESC").all() as Tweet[];
}

export function updateTweet(db: Database, id: string, updates: Partial<Tweet>): void {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  for (const [key, value] of Object.entries(updates)) {
    if (key === "id") continue;
    fields.push(`${key} = ?`);
    values.push((value as string | number | null) ?? null);
  }

  if (fields.length === 0) return;
  values.push(id);
  db.run(`UPDATE tweets SET ${fields.join(", ")} WHERE id = ?`, values);
}

export function deleteTweetRow(db: Database, id: string): void {
  db.run("DELETE FROM tweets WHERE id = ?", [id]);
}

export function getThread(db: Database, threadId: string): Tweet[] {
  return db
    .query("SELECT * FROM tweets WHERE thread_id = ? ORDER BY thread_pos ASC")
    .all(threadId) as Tweet[];
}

// --- Generation CRUD ---

export type Generation = {
  id: string;
  prompt: string;
  output: string;
  model: string | null;
  created_at: string;
};

export function saveGeneration(
  db: Database,
  prompt: string,
  output: string,
  model?: string,
): Generation {
  const id = newId();
  db.run(
    "INSERT INTO generations (id, prompt, output, model) VALUES (?, ?, ?, ?)",
    [id, prompt, output, model ?? null],
  );
  return db.query("SELECT * FROM generations WHERE id = ?").get(id) as Generation;
}
