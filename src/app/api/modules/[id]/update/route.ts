import { NextRequest, NextResponse } from "next/server";
import {
  findModuleByModuleId,
  ModuleError,
  updateModuleById,
} from "@/lib/module-system";
import { assertNotServerless } from "@/lib/module-system/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

/** POST /api/modules/[id]/update — 更新模块（拉取新版本） */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertNotServerless("更新模块");
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { ref?: string; token?: string };
    const row = await updateModuleById(id, { ref: body.ref, token: body.token });
    return NextResponse.json({ module: row });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), code: e instanceof ModuleError ? e.code : "INTERNAL" },
      { status: e instanceof ModuleError ? (e.code === "NOT_FOUND" ? 404 : 422) : 500 },
    );
  }
}
