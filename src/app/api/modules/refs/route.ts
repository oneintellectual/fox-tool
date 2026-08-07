import { NextRequest, NextResponse } from "next/server";
import { listRemoteRefs } from "@/lib/module-system";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/modules/refs — 列出远端仓库的分支/标签（用于版本选择） */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { gitUrl?: string; token?: string };
    if (!body.gitUrl?.trim()) {
      return NextResponse.json({ error: "gitUrl 不能为空" }, { status: 400 });
    }
    const refs = await listRemoteRefs(body.gitUrl.trim(), body.token);
    return NextResponse.json({ refs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
