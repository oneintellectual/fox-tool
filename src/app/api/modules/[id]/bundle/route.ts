import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { findModuleByModuleId, moduleClientBundlePath } from "@/lib/module-system";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/modules/[id]/bundle — 返回模块客户端 bundle（ESM）。
 * 浏览器侧通过 `import("/api/modules/<id>/bundle?v=<version>")` 动态加载，
 * 再调用导出的 tool.mount 渲染工具页面。
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const row = findModuleByModuleId(id);
    if (!row) return NextResponse.json({ error: "模块不存在" }, { status: 404 });
    if (row.status !== "active") {
      return NextResponse.json({ error: "模块未激活" }, { status: 409 });
    }

    const bundlePath = moduleClientBundlePath(id);
    if (!fs.existsSync(bundlePath)) {
      return NextResponse.json({ error: "模块 bundle 不存在，请重新安装" }, { status: 404 });
    }

    const content = fs.readFileSync(bundlePath, "utf-8");
    // 以 version 作为 ETag/缓存键，更新后自动失效
    const etag = `"${row.module_id}@${row.version}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304 });
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
        ETag: etag,
        "X-Module-Id": row.module_id,
        "X-Module-Version": row.version,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
