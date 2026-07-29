/**
 * SSH 监控 API 路由
 * POST /api/ssh-monitor
 *   body: { config: SshConfig, action: "test" | "metrics" }
 *   返回: { success, data?, error? }
 *
 * 注意：本路由仅用于本地开发/内网环境，凭据不会持久化存储，
 * 仅在请求处理期间使用。生产环境请增加鉴权与网络隔离。
 */

import { NextRequest, NextResponse } from "next/server";
import {
  SshConfig,
  testConnection,
  getMetrics,
} from "@/lib/ssh-monitor";

export const runtime = "nodejs";
// 监控涉及 SSH 长连接，禁用流式响应缓存
export const dynamic = "force-dynamic";

/** 校验并规范化 SSH 配置 */
function parseConfig(raw: unknown): SshConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("config 格式错误");
  }
  const b = raw as Record<string, unknown>;
  const config: SshConfig = {
    host: String(b.host || "").trim(),
    port: Number(b.port || 22),
    username: String(b.username || "").trim(),
  };
  if (typeof b.password === "string" && b.password) config.password = b.password;
  if (typeof b.privateKey === "string" && b.privateKey) config.privateKey = b.privateKey;
  if (typeof b.passphrase === "string" && b.passphrase) config.passphrase = b.passphrase;

  if (!config.host) throw new Error("host 不能为空");
  if (!config.username) throw new Error("username 不能为空");
  if (!config.password && !config.privateKey) throw new Error("必须提供 password 或 privateKey");
  return config;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体不是合法的 JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  let config: SshConfig;
  try {
    config = parseConfig(b.config);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "配置错误" },
      { status: 400 }
    );
  }

  const action = b.action;

  try {
    if (action === "test") {
      const result = await testConnection(config);
      return NextResponse.json(result);
    }

    if (action === "metrics") {
      const metrics = await getMetrics(config);
      return NextResponse.json({ success: true, data: metrics });
    }

    return NextResponse.json(
      { success: false, error: `不支持的 action: ${String(action)}` },
      { status: 400 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
