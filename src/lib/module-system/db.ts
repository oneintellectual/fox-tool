import Database from "better-sqlite3";
import { ensureBaseDir, moduleDataDir, MODULE_DB_PATH } from "./paths";
import { isVercelServerless } from "./env";
import type { ModuleRow, ModuleStatus } from "./types";

let dbInstance: Database.Database | null = null;

/** 获取模块系统单例数据库连接（首次调用时初始化表结构） */
export function getModuleDb(): Database.Database {
  if (dbInstance) return dbInstance;

  ensureBaseDir();
  const db = new Database(MODULE_DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      git_url TEXT NOT NULL,
      ref TEXT NOT NULL DEFAULT 'HEAD',
      status TEXT NOT NULL DEFAULT 'installed',
      manifest TEXT NOT NULL,
      entry_path TEXT NOT NULL,
      source_dir TEXT NOT NULL,
      bundle_path TEXT NOT NULL,
      installed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      error TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS module_config (
      module_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (module_id, key),
      FOREIGN KEY (module_id) REFERENCES modules(module_id) ON DELETE CASCADE
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_modules_status ON modules(status);`);

  dbInstance = db;
  return db;
}

function mapRow(row: Record<string, unknown>): ModuleRow {
  return {
    id: row.id as string,
    module_id: row.module_id as string,
    name: row.name as string,
    version: row.version as string,
    git_url: row.git_url as string,
    ref: row.ref as string,
    status: row.status as ModuleStatus,
    manifest: row.manifest as string,
    entry_path: row.entry_path as string,
    source_dir: row.source_dir as string,
    bundle_path: row.bundle_path as string,
    installed_at: row.installed_at as number,
    updated_at: row.updated_at as number,
    error: (row.error as string | null) ?? null,
  };
}

/** 新增模块记录 */
export function insertModule(row: ModuleRow): void {
  const db = getModuleDb();
  db.prepare(
    `INSERT INTO modules
      (id, module_id, name, version, git_url, ref, status, manifest, entry_path, source_dir, bundle_path, installed_at, updated_at, error)
     VALUES (@id, @module_id, @name, @version, @git_url, @ref, @status, @manifest, @entry_path, @source_dir, @bundle_path, @installed_at, @updated_at, @error)`,
  ).run(row);
}

/** 按 module_id 查询 */
export function findModuleByModuleId(moduleId: string): ModuleRow | null {
  try {
    const db = getModuleDb();
    const row = db.prepare("SELECT * FROM modules WHERE module_id = ?").get(moduleId);
    return row ? mapRow(row as Record<string, unknown>) : null;
  } catch (e) {
    // Vercel Serverless 上 better-sqlite3 可能无法加载（原生模块平台不匹配），
    // 降级返回 null，保证页面可用（内置工具不依赖 DB）
    if (isVercelServerless()) return null;
    throw e;
  }
}

/** 查询全部模块 */
export function listModules(): ModuleRow[] {
  try {
    const db = getModuleDb();
    return db
      .prepare("SELECT * FROM modules ORDER BY updated_at DESC")
      .all()
      .map((r) => mapRow(r as Record<string, unknown>));
  } catch (e) {
    // Vercel Serverless 上 better-sqlite3 可能无法加载，降级返回空数组
    if (isVercelServerless()) return [];
    throw e;
  }
}

/** 查询所有已激活模块 */
export function listActiveModules(): ModuleRow[] {
  const db = getModuleDb();
  return db
    .prepare("SELECT * FROM modules WHERE status = 'active'")
    .all()
    .map((r) => mapRow(r as Record<string, unknown>));
}

/** 更新模块字段 */
export function updateModule(
  moduleId: string,
  fields: Partial<
    Pick<
      ModuleRow,
      "version" | "ref" | "status" | "manifest" | "entry_path" | "source_dir" | "bundle_path" | "error" | "name"
    >
  >,
): void {
  const db = getModuleDb();
  const sets: string[] = [];
  const values: Record<string, unknown> = { module_id: moduleId };
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = @${k}`);
    values[k] = v;
  }
  sets.push("updated_at = @updated_at");
  values.updated_at = Date.now();
  db.prepare(`UPDATE modules SET ${sets.join(", ")} WHERE module_id = @module_id`).run(values);
}

/** 删除模块记录 */
export function deleteModule(moduleId: string): void {
  const db = getModuleDb();
  db.prepare("DELETE FROM modules WHERE module_id = ?").run(moduleId);
}

/** 读取模块私有配置 */
export function getConfig(moduleId: string, key: string): unknown {
  const db = getModuleDb();
  const row = db
    .prepare("SELECT value FROM module_config WHERE module_id = ? AND key = ?")
    .get(moduleId, key) as { value: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

/** 写入模块私有配置 */
export function setConfig(moduleId: string, key: string, value: unknown): void {
  const db = getModuleDb();
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  db.prepare(
    `INSERT INTO module_config (module_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(module_id, key) DO UPDATE SET value = excluded.value`,
  ).run(moduleId, key, serialized);
}

/** 删除模块全部配置（卸载时调用） */
export function clearConfig(moduleId: string): void {
  const db = getModuleDb();
  db.prepare("DELETE FROM module_config WHERE module_id = ?").run(moduleId);
}

/** 生成 DB 主键 id */
export function genModuleId(prefix = "mod_"): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export { moduleDataDir };
