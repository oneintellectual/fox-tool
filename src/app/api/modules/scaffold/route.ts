import { NextRequest, NextResponse } from "next/server";
import { ModuleError, generateScaffold, type ScaffoldOptions } from "@/lib/module-system";

export const dynamic = "force-dynamic";

/** POST /api/modules/scaffold — 生成模块项目脚手架 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<ScaffoldOptions>;
    if (!body.id || !body.name || !body.description) {
      return NextResponse.json({ error: "id / name / description 不能为空" }, { status: 400 });
    }
    const result = generateScaffold({
      id: body.id,
      name: body.name,
      description: body.description,
      outDir: body.outDir || `./${body.id}`,
      author: body.author,
      icon: body.icon,
      version: body.version,
    });
    return NextResponse.json({ outDir: result.outDir, files: result.files }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), code: e instanceof ModuleError ? e.code : "INTERNAL" },
      { status: e instanceof ModuleError ? 422 : 500 },
    );
  }
}
