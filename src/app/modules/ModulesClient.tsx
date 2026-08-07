"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ModuleRow, ModuleManifest, RemoteRef } from "@/lib/module-system";

interface ModuleRowWithMeta extends ModuleRow {
  meta: ModuleManifest;
}

export default function ModulesClient({ initial, serverless }: { initial: ModuleRow[]; serverless?: boolean }) {
  const [modules, setModules] = useState<ModuleRowWithMeta[]>(
    initial.map((m) => ({ ...m, meta: JSON.parse(m.manifest) as ModuleManifest })),
  );
  const [gitUrl, setGitUrl] = useState("");
  const [ref, setRef] = useState("HEAD");
  const [token, setToken] = useState("");
  const [refs, setRefs] = useState<RemoteRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/modules");
    const data = await res.json();
    if (data.modules) {
      setModules(data.modules.map((m: ModuleRow) => ({ ...m, meta: JSON.parse(m.manifest) as ModuleManifest })));
    }
  }, []);

  const fetchRefs = useCallback(async () => {
    if (!gitUrl.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/modules/refs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gitUrl: gitUrl.trim(), token: token || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "拉取分支失败");
      setRefs(data.refs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRefs([]);
    }
  }, [gitUrl, token]);

  const handleInstall = useCallback(async () => {
    if (!gitUrl.trim()) return;
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await fetch("/api/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gitUrl: gitUrl.trim(), ref: ref || "HEAD", activate: true, token: token || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "安装失败");
      if (data.warnings?.length) setWarnings(data.warnings);
      setGitUrl("");
      setRefs([]);
      setToken("");
      setRef("HEAD");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [gitUrl, ref, token, refresh]);

  const action = useCallback(
    async (id: string, method: "PATCH" | "DELETE" | "POST", path: string, body?: unknown) => {
      setError(null);
      try {
        const res = await fetch(`/api/modules/${id}${path}`, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "操作失败");
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [refresh],
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          <div className="font-medium">安装完成，但有警告：</div>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 安装表单 */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">从 Git 安装模块</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          输入模块仓库地址，框架将自动拉取、安全扫描、构建并激活模块。
        </p>
        {serverless && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
            ⚠ 当前为 Vercel Serverless 环境，模块安装/更新/卸载功能不可用（文件系统只读）。
            请使用本地开发环境（<code className="rounded bg-amber-100 px-1 dark:bg-amber-900">pnpm dev</code>）运行模块管理。
            内置工具不受影响，可正常使用。
          </div>
        )}
        <div className="mt-4 space-y-3">
          <input
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            placeholder="https://github.com/user/module.git"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="分支/标签/commit (默认 HEAD)"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder="访问令牌（私有仓库可选）"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          {refs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {refs.slice(0, 12).map((r) => (
                <button
                  key={r.short}
                  onClick={() => setRef(r.short)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    ref === r.short
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {r.short}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleInstall}
              disabled={busy || !gitUrl.trim() || serverless}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "安装中…" : "安装模块"}
            </button>
            <button
              onClick={fetchRefs}
              disabled={!gitUrl.trim() || serverless}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              拉取分支/标签
            </button>
          </div>
        </div>
      </div>

      {/* 已安装模块列表 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            已安装模块 ({modules.length})
          </h2>
          <button
            onClick={refresh}
            className="text-sm text-slate-500 hover:text-blue-600 dark:text-slate-400"
          >
            刷新
          </button>
        </div>

        {modules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <div className="text-4xl">🧩</div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              暂无外部模块，通过上方表单安装第一个模块
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {modules.map((m) => (
              <ModuleCard key={m.module_id} m={m} onAction={action} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function statusBadge(status: ModuleRow["status"]) {
  const map: Record<ModuleRow["status"], { label: string; cls: string }> = {
    installed: { label: "已安装", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
    active: { label: "运行中", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
    inactive: { label: "已停用", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
    error: { label: "错误", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  };
  const s = map[status] || map.installed;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}

function ModuleCard({
  m,
  onAction,
}: {
  m: ModuleRowWithMeta;
  onAction: (id: string, method: "PATCH" | "DELETE" | "POST", path: string, body?: unknown) => Promise<void>;
}) {
  const [updating, setUpdating] = useState(false);
  const isActive = m.status === "active";

  const handleUpdate = async () => {
    setUpdating(true);
    await onAction(m.module_id, "POST", "/update", { ref: m.ref });
    setUpdating(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-colors dark:border-slate-700/80 dark:bg-slate-900">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xl shadow-lg shadow-blue-500/20">
          {m.meta.icon || "🧩"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">{m.meta.name}</h3>
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {m.meta.id}
            </code>
            <span className="text-xs text-slate-400">v{m.version}</span>
            {statusBadge(m.status)}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{m.meta.description}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
            <span>ref: {m.ref}</span>
            <span>·</span>
            <span>安装于 {new Date(m.installed_at).toLocaleString()}</span>
            {m.error && (
              <>
                <span>·</span>
                <span className="text-red-500">{m.error}</span>
              </>
            )}
          </div>
          {m.meta.dependencies && m.meta.dependencies.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {m.meta.dependencies.map((d) => (
                <span
                  key={d.name}
                  className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                >
                  {d.name}@{d.version}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isActive ? (
          <button
            onClick={() => onAction(m.module_id, "PATCH", "", { action: "deactivate" })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            停用
          </button>
        ) : (
          <button
            onClick={() => onAction(m.module_id, "PATCH", "", { action: "activate" })}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            激活
          </button>
        )}
        <button
          onClick={handleUpdate}
          disabled={updating}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {updating ? "更新中…" : "更新"}
        </button>
        <button
          onClick={() => {
            if (confirm(`确认卸载模块 ${m.meta.name}？该操作将删除模块代码与数据。`)) {
              onAction(m.module_id, "DELETE", "");
            }
          }}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          卸载
        </button>
        {isActive && (
          <Link
            href={`/modules/${m.module_id}`}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            打开工具 →
          </Link>
        )}
      </div>
    </div>
  );
}
