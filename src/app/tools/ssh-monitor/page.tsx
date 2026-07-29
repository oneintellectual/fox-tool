"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  MonitorMetrics,
  formatBytes,
  formatKB,
} from "@/lib/ssh-monitor-types";
import {
  AnalysisReport,
  AnalysisItem,
  analyzeMetrics,
  severityColor,
  statusColor,
} from "@/lib/ssh-monitor-analysis";

interface SshFormState {
  host: string;
  port: number;
  username: string;
  authType: "password" | "key";
  password: string;
  privateKey: string;
  passphrase: string;
}

const DEFAULT_FORM: SshFormState = {
  host: "",
  port: 22,
  username: "root",
  authType: "password",
  password: "",
  privateKey: "",
  passphrase: "",
};

/** 进度条颜色根据使用率返回 */
function usageColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

/** 构造发给后端的 SSH 配置 */
function buildConfig(form: SshFormState) {
  return {
    host: form.host,
    port: form.port,
    username: form.username,
    password: form.authType === "password" ? form.password : undefined,
    privateKey: form.authType === "key" ? form.privateKey : undefined,
    passphrase: form.authType === "key" ? form.passphrase : undefined,
  };
}

export default function SshMonitorPage() {
  const [form, setForm] = useState<SshFormState>(DEFAULT_FORM);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [metrics, setMetrics] = useState<MonitorMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateField = useCallback(
    (field: keyof SshFormState, value: string | number) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const fetchMetrics = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      setError(null);
      try {
        const res = await fetch("/api/ssh-monitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config: buildConfig(form),
            action: "metrics",
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || json.message || `HTTP ${res.status}`);
        }
        setMetrics(json.data);
        setLastRefresh(new Date().toLocaleTimeString("zh-CN"));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        if (!silent) setConnected(false);
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [form]
  );

  const handleTest = useCallback(async () => {
    setTesting(true);
    setError(null);
    try {
      const res = await fetch("/api/ssh-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: buildConfig(form),
          action: "test",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || `HTTP ${res.status}`);
      }
      setError(null);
      alert(`✓ 连接成功！主机名: ${json.hostname || "unknown"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }, [form]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      await fetchMetrics(false);
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, [fetchMetrics]);

  const handleDisconnect = useCallback(() => {
    setConnected(false);
    setMetrics(null);
    setAutoRefresh(false);
    setError(null);
  }, []);

  // 自动刷新
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoRefresh && connected) {
      timerRef.current = setInterval(() => {
        fetchMetrics(true);
      }, 5000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoRefresh, connected, fetchMetrics]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title="返回工具箱"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white font-bold text-lg shadow-lg shadow-violet-500/25">
              📡
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                SSH Linux 监控
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                通过 SSH 实时监控远程 Linux 服务器
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* 错误提示 */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">操作失败</p>
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-400 break-all">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 dark:hover:text-red-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* 连接配置表单 */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              🔐 SSH 连接配置
            </h2>
            {connected && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                已连接 · {form.host}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">主机地址</label>
              <input
                type="text"
                value={form.host}
                onChange={(e) => updateField("host", e.target.value)}
                placeholder="192.168.1.10"
                disabled={connected}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:disabled:bg-slate-800/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">端口</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => updateField("port", parseInt(e.target.value, 10) || 22)}
                disabled={connected}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:disabled:bg-slate-800/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">用户名</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => updateField("username", e.target.value)}
                placeholder="root"
                disabled={connected}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:disabled:bg-slate-800/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">认证方式</label>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => updateField("authType", "password")}
                  disabled={connected}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-60 ${
                    form.authType === "password"
                      ? "bg-white text-violet-600 shadow-sm dark:bg-slate-700 dark:text-violet-300"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  密码
                </button>
                <button
                  type="button"
                  onClick={() => updateField("authType", "key")}
                  disabled={connected}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-60 ${
                    form.authType === "key"
                      ? "bg-white text-violet-600 shadow-sm dark:bg-slate-700 dark:text-violet-300"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  私钥
                </button>
              </div>
            </div>
          </div>

          {/* 密码 / 私钥输入 */}
          {form.authType === "password" ? (
            <div className="mt-4">
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">密码</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="••••••••"
                disabled={connected}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:disabled:bg-slate-800/50"
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                  私钥（PEM 格式，粘贴完整内容）
                </label>
                <textarea
                  value={form.privateKey}
                  onChange={(e) => updateField("privateKey", e.target.value)}
                  placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                  rows={4}
                  disabled={connected}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:disabled:bg-slate-800/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                  私钥口令（可选）
                </label>
                <input
                  type="password"
                  value={form.passphrase}
                  onChange={(e) => updateField("passphrase", e.target.value)}
                  placeholder="无口令可留空"
                  disabled={connected}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:disabled:bg-slate-800/50"
                />
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="mt-5 flex flex-wrap gap-3">
            {!connected ? (
              <>
                <button
                  onClick={handleTest}
                  disabled={testing || connecting || !form.host}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {testing ? "测试中..." : "🔌 测试连接"}
                </button>
                <button
                  onClick={handleConnect}
                  disabled={connecting || testing || !form.host}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:from-violet-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
                >
                  {connecting ? "连接中..." : "🚀 连接并监控"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => fetchMetrics(false)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:from-violet-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {refreshing ? "刷新中..." : "🔄 刷新"}
                </button>
                <button
                  onClick={() => setAutoRefresh((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                    autoRefresh
                      ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${autoRefresh ? "bg-violet-500 animate-pulse" : "bg-slate-400"}`} />
                  自动刷新 {autoRefresh ? "(5s)" : ""}
                </button>
                <button
                  onClick={handleDisconnect}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-all hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  ⏏️ 断开连接
                </button>
                {lastRefresh && (
                  <span className="self-center text-xs text-slate-400 dark:text-slate-500">
                    最后更新: {lastRefresh}
                  </span>
                )}
              </>
            )}
          </div>

          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            💡 提示：凭据仅在浏览器会话中保存，每次请求时发送到本地后端建立 SSH 连接，不会持久化存储。
          </p>
        </div>

        {/* 监控仪表盘 */}
        {connected && metrics ? (
          <MetricsDashboard metrics={metrics} />
        ) : connected && !metrics ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-4xl mb-3">⏳</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">正在获取监控数据...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-4xl mb-3">📡</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              请填写 SSH 连接信息并点击「连接并监控」
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              支持 CPU、内存、磁盘、网络、进程等核心指标监控
            </p>
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-200/60 bg-white/40 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-950/40">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Fox Tool · SSH Linux 监控 · Made with ❤️
          </p>
        </div>
      </footer>
    </div>
  );
}

/** 监控仪表盘组件 */
function MetricsDashboard({ metrics }: { metrics: MonitorMetrics }) {
  const { system, cpu, memory, disks, networks, processes } = metrics;

  // 使用 useMemo 缓存分析报告，避免每次渲染都重新计算
  const report = useMemo(() => analyzeMetrics(metrics), [metrics]);

  return (
    <div className="space-y-6">
      {/* 指标分析面板 */}
      <AnalysisPanel report={report} />

      {/* 系统信息 + CPU + 内存 概览卡片 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* 系统信息 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-lg">🖥️</span>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">系统信息</h3>
          </div>
          <dl className="space-y-2 text-sm">
            <InfoRow label="主机名" value={system.hostname} />
            <InfoRow label="操作系统" value={system.release || system.os} />
            <InfoRow label="内核版本" value={system.kernel} />
            <InfoRow label="运行时长" value={system.uptimeStr} />
            <InfoRow label="服务器时间" value={system.serverTime} />
            <InfoRow label="启动时间" value={system.bootTime} />
          </dl>
        </div>

        {/* CPU 使用率 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">CPU</h3>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">{cpu.cores} 核</span>
          </div>
          <div className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">使用率</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {cpu.usagePercent.toFixed(1)}%
              </span>
            </div>
            <UsageBar percent={cpu.usagePercent} />
          </div>
          <dl className="space-y-2 text-sm">
            <InfoRow label="型号" value={cpu.model} />
            <InfoRow
              label="负载均衡"
              value={`${cpu.loadAvg1.toFixed(2)} / ${cpu.loadAvg5.toFixed(2)} / ${cpu.loadAvg15.toFixed(2)} (1/5/15m)`}
            />
          </dl>
        </div>

        {/* 内存使用率 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧠</span>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">内存</h3>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {formatKB(memory.used)} / {formatKB(memory.total)}
            </span>
          </div>
          <div className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">使用率</span>
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {memory.usagePercent.toFixed(1)}%
              </span>
            </div>
            <UsageBar percent={memory.usagePercent} />
          </div>
          <dl className="space-y-2 text-sm">
            <InfoRow label="可用" value={formatKB(memory.available)} />
            <InfoRow label="缓存/缓冲" value={`${formatKB(memory.cached)} / ${formatKB(memory.buffers)}`} />
            {memory.swapTotal > 0 && (
              <InfoRow
                label="Swap"
                value={`${formatKB(memory.swapUsed)} / ${formatKB(memory.swapTotal)}`}
              />
            )}
          </dl>
        </div>
      </div>

      {/* 磁盘 + 网络 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 磁盘分区 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-lg">💾</span>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">磁盘分区</h3>
          </div>
          {disks.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">未检测到磁盘分区</p>
          ) : (
            <div className="space-y-3">
              {disks.map((d, i) => (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {d.mount}
                      </code>
                      <span className="text-slate-400 dark:text-slate-500">{d.filesystem} · {d.type}</span>
                    </div>
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      {formatBytes(d.used)} / {formatBytes(d.total)}
                    </span>
                  </div>
                  <UsageBar percent={d.usagePercent} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 网络接口 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-lg">🌐</span>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">网络接口</h3>
          </div>
          {networks.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">未检测到网络接口</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 pr-3 text-left font-medium">接口</th>
                    <th className="py-2 pr-3 text-left font-medium">IP</th>
                    <th className="py-2 pr-3 text-right font-medium">接收</th>
                    <th className="py-2 pr-3 text-right font-medium">发送</th>
                    <th className="py-2 text-right font-medium">包(Rx/Tx)</th>
                  </tr>
                </thead>
                <tbody>
                  {networks.map((n, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50">
                      <td className="py-2 pr-3">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {n.name}
                        </code>
                      </td>
                      <td className="py-2 pr-3 font-mono text-slate-600 dark:text-slate-300">
                        {n.ip || "-"}
                      </td>
                      <td className="py-2 pr-3 text-right text-emerald-600 dark:text-emerald-400">
                        {formatBytes(n.rxBytes)}
                      </td>
                      <td className="py-2 pr-3 text-right text-violet-600 dark:text-violet-400">
                        {formatBytes(n.txBytes)}
                      </td>
                      <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                        {n.rxPackets} / {n.txPackets}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 进程列表 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-lg">📋</span>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Top 进程（按 CPU 排序，前 15 个）
          </h3>
        </div>
        {processes.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">无进程数据</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-3 text-left font-medium">PID</th>
                  <th className="py-2 pr-3 text-left font-medium">用户</th>
                  <th className="py-2 pr-3 text-right font-medium">CPU%</th>
                  <th className="py-2 pr-3 text-right font-medium">MEM%</th>
                  <th className="py-2 text-left font-medium">命令</th>
                </tr>
              </thead>
              <tbody>
                {processes.map((p, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-2 pr-3 font-mono text-slate-500 dark:text-slate-400">{p.pid}</td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{p.user}</td>
                    <td className="py-2 pr-3 text-right">
                      <span className={p.cpu > 50 ? "font-semibold text-red-600 dark:text-red-400" : p.cpu > 20 ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-300"}>
                        {p.cpu.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={p.mem > 50 ? "font-semibold text-red-600 dark:text-red-400" : p.mem > 20 ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-300"}>
                        {p.mem.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-2 font-mono text-slate-700 dark:text-slate-300 max-w-[400px] truncate">
                      {p.command}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** 指标分析面板 */
function AnalysisPanel({ report }: { report: AnalysisReport }) {
  const [filter, setFilter] = useState<"all" | "issues">("issues");
  const sc = statusColor(report.status);

  const visibleItems =
    filter === "all"
      ? report.items
      : report.items.filter((i) => i.severity === "critical" || i.severity === "warning");

  const issueCount = report.items.filter(
    (i) => i.severity === "critical" || i.severity === "warning"
  ).length;
  const criticalCount = report.items.filter((i) => i.severity === "critical").length;
  const warningCount = report.items.filter((i) => i.severity === "warning").length;
  const successCount = report.items.filter((i) => i.severity === "success").length;

  return (
    <div className="space-y-4">
      {/* 健康总览 */}
      <div className={`rounded-2xl border ${sc.border} ${sc.bg} p-5 shadow-sm`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* 健康评分环 */}
            <div className="relative h-20 w-20 shrink-0">
              <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  className="text-slate-200 dark:text-slate-700"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${(report.overallScore / 100) * 213.6} 213.6`}
                  className={`${sc.text} transition-all duration-700`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold ${sc.text}`}>{report.overallScore}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">健康分</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  系统健康状态
                </h3>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${sc.bg} ${sc.text} border ${sc.border}`}>
                  <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${sc.gradient}`} />
                  {report.statusText}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {criticalCount > 0
                  ? `检测到 ${criticalCount} 项严重问题，${warningCount} 项告警，建议立即处理`
                  : warningCount > 0
                    ? `检测到 ${warningCount} 项告警，${successCount} 项指标正常`
                    : `所有指标运行正常，共 ${successCount} 项检查通过`}
              </p>
            </div>
          </div>

          {/* 维度评分 */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {report.scores.map((s) => {
              const color =
                s.score >= 90
                  ? "text-emerald-600 dark:text-emerald-400"
                  : s.score >= 75
                    ? "text-sky-600 dark:text-sky-400"
                    : s.score >= 60
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-red-600 dark:text-red-400";
              return (
                <div
                  key={s.category}
                  className="flex flex-col items-center rounded-lg bg-white/60 px-2 py-2 dark:bg-slate-800/60"
                >
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{s.label}</span>
                  <span className={`text-sm font-bold ${color}`}>{s.score}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 关键风险摘要 */}
      {report.topRisks.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">🚨</span>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              关键风险摘要
            </h3>
            <span className="ml-auto text-xs text-slate-400">
              共 {issueCount} 项需关注
            </span>
          </div>
          <div className="space-y-2">
            {report.topRisks.map((risk, i) => (
              <AnalysisItemRow key={i} item={risk} compact />
            ))}
          </div>
        </div>
      )}

      {/* 全部分析项 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            详细分析
          </h3>
          <div className="ml-auto flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setFilter("issues")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                filter === "issues"
                  ? "bg-white text-violet-600 shadow-sm dark:bg-slate-700 dark:text-violet-300"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              仅看问题 ({issueCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                filter === "all"
                  ? "bg-white text-violet-600 shadow-sm dark:bg-slate-700 dark:text-violet-300"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              全部 ({report.items.length})
            </button>
          </div>
        </div>
        {visibleItems.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              没有需要关注的问题，所有指标正常
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleItems.map((item, i) => (
              <AnalysisItemRow key={i} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 单条分析项 */
function AnalysisItemRow({ item, compact = false }: { item: AnalysisItem; compact?: boolean }) {
  const c = severityColor(item.severity);
  const categoryLabel: Record<AnalysisItem["category"], string> = {
    system: "系统",
    cpu: "CPU",
    memory: "内存",
    disk: "磁盘",
    network: "网络",
    process: "进程",
  };

  return (
    <div className={`flex items-start gap-3 rounded-lg border ${c.border} ${c.bg} p-3`}>
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${c.text}`}>{item.title}</span>
          <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
            {categoryLabel[item.category]}
          </span>
          {!compact && (
            <span className={`text-[10px] ${c.text} opacity-70`}>· {c.label}</span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 break-words">
          {item.detail}
        </p>
        {item.suggestion && !compact && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            <span className="font-medium">💡 建议：</span>
            {item.suggestion}
          </p>
        )}
      </div>
    </div>
  );
}

/** 信息行 */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right text-xs font-medium text-slate-700 dark:text-slate-300 break-all">
        {value || "-"}
      </dd>
    </div>
  );
}

/** 使用率进度条 */
function UsageBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        className={`h-full rounded-full transition-all duration-500 ${usageColor(clamped)}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
