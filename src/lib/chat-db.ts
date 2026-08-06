import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/**
 * 数据库文件存放目录
 * 优先使用环境变量 CHAT_DB_DIR（便于部署环境指定可写路径，如 /tmp）
 * 默认使用项目根目录下的 data/（process.cwd() 在 next dev/start 时为项目根）
 */
const DATA_DIR = process.env.CHAT_DB_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "chat.db");

let dbInstance: Database.Database | null = null;

/** 获取单例数据库连接（首次调用时初始化表结构） */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  // 确保数据目录存在
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  // 会话表
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

  // 消息表
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
