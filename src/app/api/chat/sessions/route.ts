import { NextRequest, NextResponse } from "next/server";
import { getDb, genId, type ChatSessionRow } from "@/lib/chat-db";

/** 强制动态渲染（API 路由访问文件系统） */
export const dynamic = "force-dynamic";

/** GET /api/chat/sessions — 列出所有会话（按更新时间倒序） */
export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(
      "SELECT id, title, model_id, system_prompt, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC"
    ).all() as ChatSessionRow[];
    return NextResponse.json({ sessions: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/chat/sessions — 创建新会话 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const now = Date.now();
    const id = genId("s_");
    const title = (body.title as string)?.trim() || "新对话";
    const modelId = (body.model_id as string) || null;
    const systemPrompt = (body.system_prompt as string) || "";

    const db = getDb();
    db.prepare(
      "INSERT INTO chat_sessions (id, title, model_id, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, title, modelId, systemPrompt, now, now);

    const row = db.prepare("SELECT id, title, model_id, system_prompt, created_at, updated_at FROM chat_sessions WHERE id = ?")
      .get(id) as ChatSessionRow;
    return NextResponse.json({ session: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
