import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/**
 * 解析数据目录：
 * 1. 环境变量 CHAT_DB_DIR 最高优先级
 * 2. Vercel / Lambda 环境（process.cwd() 以 /var/task 开头或 VERCEL=1）→ 用 /tmp/fox-chat
 * 3. 本地/自托管 → 项目根 data/
 */
function resolveDataDir(): string {
  if (process.env.CHAT_DB_DIR) return process.env.CHAT_DB_DIR;

  const cwd = process.cwd();
  const isServerless =
    process.env.VERCEL === "1" ||
    process.env.AWS_LAMBDA_FUNCTION_VERSION !== undefined ||
    cwd.startsWith("/var/task") ||
    cwd.startsWith("/var/task/");

  if (isServerless) {
    return path.join("/tmp", "fox-chat");
  }

  return path.join(cwd, "data");
}

const DATA_DIR = resolveDataDir();
const DB_PATH = path.join(DATA_DIR, "chat.db");

let dbInstance: Database.Database | null = null;

/** 获取单例数据库连接（首次调用时初始化表结构） */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model_id TEXT,
      system_prompt TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('system','user','assistant')),
      content TEXT NOT NULL,
      seq INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, seq);`);

  dbInstance = db;
  return db;
}

/** 会话记录 */
export interface ChatSessionRow {
  id: string;
  title: string;
  model_id: string | null;
  system_prompt: string;
  created_at: number;
  updated_at: number;
}

/** 消息记录 */
export interface ChatMessageRow {
  id: string;
  session_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  seq: number;
  created_at: number;
}

/** 生成简单 ID（时间戳 + 随机串） */
export function genId(prefix = ""): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
