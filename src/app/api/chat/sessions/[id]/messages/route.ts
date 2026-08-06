import { NextRequest, NextResponse } from "next/server";
import { getDb, genId, type ChatMessageRow } from "@/lib/chat-db";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** GET /api/chat/sessions/[id]/messages — 列出会话所有消息（按 seq 升序） */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDb();
    const session = db.prepare("SELECT id FROM chat_sessions WHERE id = ?").get(id);
    if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    const messages = db.prepare(
      "SELECT id, session_id, role, content, seq, created_at FROM chat_messages WHERE session_id = ? ORDER BY seq ASC"
    ).all(id) as ChatMessageRow[];
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/chat/sessions/[id]/messages — 向会话追加消息（单条或批量） */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const db = getDb();
    const session = db.prepare("SELECT id FROM chat_sessions WHERE id = ?").get(id);
    if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    // 支持单条 { role, content } 或批量 { messages: [{role, content}, ...] }
    const incoming: Array<{ role: "system" | "user" | "assistant"; content: string }> =
      Array.isArray(body.messages) ? body.messages : [{ role: body.role, content: body.content }];

    if (incoming.length === 0) {
      return NextResponse.json({ error: "无消息内容" }, { status: 400 });
    }

    // 当前最大 seq
    const maxSeqRow = db.prepare("SELECT COALESCE(MAX(seq), -1) AS max_seq FROM chat_messages WHERE session_id = ?").get(id) as { max_seq: number };
    let seq = maxSeqRow.max_seq + 1;
    const now = Date.now();
    const inserted: ChatMessageRow[] = [];

    const insertStmt = db.prepare(
      "INSERT INTO chat_messages (id, session_id, role, content, seq, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const tx = db.transaction(() => {
      for (const m of incoming) {
        if (!m.role || typeof m.content !== "string") continue;
        const msgId = genId("m_");
        insertStmt.run(msgId, id, m.role, m.content, seq, now);
        inserted.push({ id: msgId, session_id: id, role: m.role, content: m.content, seq, created_at: now });
        seq++;
      }
      // 更新会话的 updated_at
      db.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?").run(now, id);
    });
    tx();

    return NextResponse.json({ messages: inserted });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
