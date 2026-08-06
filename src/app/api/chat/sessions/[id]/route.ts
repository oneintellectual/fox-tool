import { NextRequest, NextResponse } from "next/server";
import { getDb, type ChatSessionRow } from "@/lib/chat-db";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** GET /api/chat/sessions/[id] — 获取会话详情 + 所有消息 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDb();
    const session = db.prepare(
      "SELECT id, title, model_id, system_prompt, created_at, updated_at FROM chat_sessions WHERE id = ?"
    ).get(id) as ChatSessionRow | undefined;
    if (!session) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }
    const messages = db.prepare(
      "SELECT id, session_id, role, content, seq, created_at FROM chat_messages WHERE session_id = ? ORDER BY seq ASC"
    ).all(id);
    return NextResponse.json({ session, messages });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** PATCH /api/chat/sessions/[id] — 更新会话（标题/模型/系统提示词） */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const db = getDb();

    const existing = db.prepare("SELECT id FROM chat_sessions WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: "会话不存在" }, { status: 404 });

    const updates: string[] = [];
    const values: unknown[] = [];
    if (typeof body.title === "string") { updates.push("title = ?"); values.push(body.title.trim()); }
    if (typeof body.model_id === "string") { updates.push("model_id = ?"); values.push(body.model_id); }
    if (typeof body.system_prompt === "string") { updates.push("system_prompt = ?"); values.push(body.system_prompt); }
    if (updates.length === 0) {
      return NextResponse.json({ error: "无更新字段" }, { status: 400 });
    }
    updates.push("updated_at = ?");
    values.push(Date.now());
    values.push(id);

    db.prepare(`UPDATE chat_sessions SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    const row = db.prepare("SELECT id, title, model_id, system_prompt, created_at, updated_at FROM chat_sessions WHERE id = ?")
      .get(id) as ChatSessionRow;
    return NextResponse.json({ session: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** DELETE /api/chat/sessions/[id] — 删除会话及其所有消息 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(id);
    const info = db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);
    if (info.changes === 0) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
