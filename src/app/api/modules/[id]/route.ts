import { NextRequest, NextResponse } from "next/server";
import {
  activateModule,
  deactivateModule,
  findModuleByModuleId,
  ModuleError,
  uninstallModule,
} from "@/lib/module-system";
import { assertNotServerless } from "@/lib/module-system/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

/** GET /api/modules/[id] — 查询单个模块详情 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const row = findModuleByModuleId(id);
    if (!row) return NextResponse.json({ error: "模块不存在" }, { status: 404 });
    return NextResponse.json({ module: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** PATCH /api/modules/[id] — 激活/停用模块 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertNotServerless("激活/停用模块");
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: "activate" | "deactivate" };
    const action = body.action;
    if (action !== "activate" && action !== "deactivate") {
      return NextResponse.json({ error: "action 必须为 activate 或 deactivate" }, { status: 400 });
    }
    if (action === "activate") {
      await activateModule(id);
    } else {
      await deactivateModule(id);
    }
    const row = findModuleByModuleId(id);
    return NextResponse.json({ module: row });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), code: e instanceof ModuleError ? e.code : "INTERNAL" },
      { status: e instanceof ModuleError && e.code === "NOT_FOUND" ? 404 : 500 },
    );
  }
}

/** DELETE /api/modules/[id] — 卸载模块 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    assertNotServerless("卸载模块");
    const { id } = await params;
    await uninstallModule(id);
    return NextResponse.json({ ok: true, moduleId: id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), code: e instanceof ModuleError ? e.code : "INTERNAL" },
      { status: e instanceof ModuleError && e.code === "NOT_FOUND" ? 404 : 500 },
    );
  }
}
