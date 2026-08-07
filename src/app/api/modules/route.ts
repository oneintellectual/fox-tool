import { NextRequest, NextResponse } from "next/server";
import {
  installModule,
  listModules,
  ModuleError,
  type InstallRequest,
} from "@/lib/module-system";
import { assertNotServerless } from "@/lib/module-system/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/modules — 列出全部已安装模块 */
export async function GET() {
  try {
    const rows = listModules();
    return NextResponse.json({ modules: rows });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** POST /api/modules — 通过 Git 地址安装模块 */
export async function POST(req: NextRequest) {
  try {
    assertNotServerless("安装模块");
    const body = (await req.json().catch(() => ({}))) as InstallRequest;
    if (!body.gitUrl?.trim()) {
      return NextResponse.json({ error: "gitUrl 不能为空" }, { status: 400 });
    }
    const result = await installModule({
      gitUrl: body.gitUrl.trim(),
      ref: body.ref || "HEAD",
      activate: body.activate ?? true,
      token: body.token,
    });
    return NextResponse.json({ module: result.row, activated: result.activated, warnings: result.warnings }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e), code: e instanceof ModuleError ? e.code : "INTERNAL" }, { status: errStatus(e) });
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function errStatus(e: unknown): number {
  if (e instanceof ModuleError) {
    switch (e.code) {
      case "ALREADY_INSTALLED":
        return 409;
      case "MANIFEST_INVALID":
      case "METADATA_MISMATCH":
      case "DEPENDENCY_MISSING":
      case "DEPENDENCY_CONFLICT":
      case "VERSION_INCOMPATIBLE":
        return 422;
      case "SECURITY_VIOLATION":
        return 403;
      case "NOT_FOUND":
        return 404;
      default:
        return 500;
    }
  }
  return 500;
}
