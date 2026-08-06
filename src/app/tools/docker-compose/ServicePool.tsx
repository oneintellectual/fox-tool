"use client";

import { useCallback, useMemo, useState } from "react";
import type { DockerService } from "@/lib/docker-compose-generator";
import { buildComposeFromServices, generateDockerComposeYAML } from "@/lib/docker-compose-generator";

/** 服务池中的单个服务条目 */
export interface PoolService {
  id: string;
  source: string;
  serviceName: string;
  service: DockerService;
}

/** 拆分分组 */
export interface SplitGroup {
  id: string;
  name: string;
  serviceIds: string[];
}

/** 拆分输出结果 */
export interface SplitResult {
  name: string;
  yaml: string;
}

interface ServicePoolProps {
  pool: PoolService[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onMerge: (yaml: string, count: number) => void;
  onSplit: (results: SplitResult[]) => void;
}

let groupSeq = 0;
function newGroupId(): string {
  groupSeq += 1;
  return `g-${Date.now()}-${groupSeq}`;
}

export default function ServicePool({
  pool,
  onRemove,
  onClear,
  onMerge,
  onSplit,
}: ServicePoolProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitMode, setSplitMode] = useState(false);
  const [groups, setGroups] = useState<SplitGroup[]>([]);

  const selectedCount = selected.size;
  const allSelected = pool.length > 0 && selectedCount === pool.length;

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === pool.length) return new Set();
      return new Set(pool.map((p) => p.id));
    });
  }, [pool]);

  const handleMerge = useCallback(() => {
    const picked = pool.filter((p) => selected.has(p.id));
    if (picked.length === 0) return;
    const config = buildComposeFromServices(
      picked.map((p) => ({ name: p.serviceName, service: p.service }))
    );
    onMerge(generateDockerComposeYAML(config), picked.length);
  }, [pool, selected, onMerge]);

  const addGroup = useCallback(() => {
    const name = `分组 ${groups.length + 1}`;
    setGroups((prev) => [...prev, { id: newGroupId(), name, serviceIds: [] }]);
  }, [groups.length]);

  const removeGroup = useCallback((id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const renameGroup = useCallback((id: string, name: string) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name } : g)));
  }, []);

  const addSelectedToGroup = useCallback(
    (groupId: string) => {
      if (selectedCount === 0) return;
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g;
          const existing = new Set(g.serviceIds);
          const toAdd = pool.filter((p) => selected.has(p.id) && !existing.has(p.id));
          return { ...g, serviceIds: [...g.serviceIds, ...toAdd.map((p) => p.id)] };
        })
      );
    },
    [selectedCount, selected, pool]
  );

  const removeFromGroup = useCallback((groupId: string, serviceId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, serviceIds: g.serviceIds.filter((sid) => sid !== serviceId) }
          : g
      )
    );
  }, []);

  const handleSplit = useCallback(() => {
    const results: SplitResult[] = groups
      .filter((g) => g.serviceIds.length > 0)
      .map((g) => {
        const picked = pool.filter((p) => g.serviceIds.includes(p.id));
        const config = buildComposeFromServices(
          picked.map((p) => ({ name: p.serviceName, service: p.service }))
        );
        return { name: g.name, yaml: generateDockerComposeYAML(config) };
      });
    if (results.length === 0) return;
    onSplit(results);
  }, [groups, pool, onSplit]);

  const serviceById = useMemo(() => {
    const m = new Map<string, PoolService>();
    for (const p of pool) m.set(p.id, p);
    return m;
  }, [pool]);

  if (pool.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
        <p className="text-sm text-slate-400">
          服务池为空。在任意模式中点击「加入服务池」即可将服务添加到此处，用于合并或拆分。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={toggleAll}
          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {allSelected ? "取消全选" : "全选"}
        </button>
        <span className="text-xs text-slate-400">
          共 {pool.length} 个服务，已选 {selectedCount}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={splitMode}
              onChange={(e) => setSplitMode(e.target.checked)}
              className="h-3.5 w-3.5 accent-orange-500"
            />
            拆分模式
          </label>
          <button
            onClick={onClear}
            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            清空
          </button>
        </div>
      </div>

      {/* 服务列表 */}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {pool.map((p) => {
          const checked = selected.has(p.id);
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition ${
                checked
                  ? "border-orange-300 bg-orange-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleSelect(p.id)}
                className="h-4 w-4 accent-orange-500"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-slate-700">
                    {p.serviceName}
                  </span>
                  {!p.service.image && (
                    <span className="shrink-0 text-amber-500" title="缺少镜像">⚠</span>
                  )}
                </div>
                <div className="truncate text-xs text-slate-400">{p.service.image || "（无镜像）"}</div>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                {p.source}
              </span>
              <button
                onClick={() => onRemove(p.id)}
                className="shrink-0 text-slate-300 hover:text-red-500"
                title="移除"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* 合并按钮 */}
      {!splitMode && (
        <button
          onClick={handleMerge}
          disabled={selectedCount === 0}
          className="w-full rounded-lg bg-gradient-to-r from-orange-500 to-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
        >
          合并生成（{selectedCount} 个服务 → 1 个 compose 文件）
        </button>
      )}

      {/* 拆分模式 */}
      {splitMode && (
        <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/30 p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700">拆分分组</h4>
            <button
              onClick={addGroup}
              className="rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
            >
              + 新增分组
            </button>
          </div>
          <p className="text-xs text-slate-400">
            先在上方勾选服务，再点「加入此分组」。同一服务可属于多个分组（任意组合）。
          </p>

          {groups.length === 0 && (
            <p className="py-3 text-center text-xs text-slate-400">尚无分组，点击「新增分组」开始</p>
          )}

          {groups.map((g) => (
            <div key={g.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="text"
                  value={g.name}
                  onChange={(e) => renameGroup(g.id, e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-medium text-slate-700 focus:border-indigo-400 focus:outline-none"
                />
                <button
                  onClick={() => addSelectedToGroup(g.id)}
                  disabled={selectedCount === 0}
                  className="shrink-0 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
                >
                  加入此分组（+{selectedCount}）
                </button>
                <button
                  onClick={() => removeGroup(g.id)}
                  className="shrink-0 text-slate-300 hover:text-red-500"
                  title="删除分组"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  </svg>
                </button>
              </div>
              {g.serviceIds.length === 0 ? (
                <p className="py-1 text-xs text-slate-400">空分组</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {g.serviceIds.map((sid) => {
                    const svc = serviceById.get(sid);
                    if (!svc) return null;
                    return (
                      <span
                        key={sid}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-xs text-slate-600"
                      >
                        {svc.serviceName}
                        <button
                          onClick={() => removeFromGroup(g.id, sid)}
                          className="text-slate-300 hover:text-red-500"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <button
            onClick={handleSplit}
            disabled={groups.every((g) => g.serviceIds.length === 0)}
            className="w-full rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
          >
            拆分生成（{groups.filter((g) => g.serviceIds.length > 0).length} 个 compose 文件）
          </button>
        </div>
      )}
    </div>
  );
}
