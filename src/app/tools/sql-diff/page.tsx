"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { diffSQL, DiffResult, ColumnDiff, TableDiff } from "@/lib/sql-differ";

// 动态导入 CodeMirror 组件，避免 SSR 问题
const SqlEditor = dynamic(() => import("@/components/SqlEditor"), { ssr: false });
const CodeViewer = dynamic(() => import("@/components/CodeViewer"), { ssr: false });

const EXAMPLE_SOURCE_SQL = `CREATE TABLE sys_user (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  username VARCHAR(64) NOT NULL COMMENT '用户名',
  password VARCHAR(128) NOT NULL COMMENT '密码',
  nickname VARCHAR(64) DEFAULT '' COMMENT '昵称',
  email VARCHAR(128) DEFAULT NULL COMMENT '邮箱',
  phone VARCHAR(20) DEFAULT NULL COMMENT '手机号',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 0-禁用, 1-启用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) COMMENT='系统用户表';

CREATE TABLE sys_role (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '角色ID',
  role_name VARCHAR(64) NOT NULL COMMENT '角色名称',
  role_key VARCHAR(64) NOT NULL COMMENT '角色标识',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '状态',
  PRIMARY KEY (id)
) COMMENT='系统角色表';`;

const EXAMPLE_TARGET_SQL = `CREATE TABLE sys_user (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  username VARCHAR(128) NOT NULL COMMENT '用户名',
  password VARCHAR(256) NOT NULL COMMENT '密码',
  nickname VARCHAR(64) DEFAULT '' COMMENT '昵称',
  email VARCHAR(128) DEFAULT NULL COMMENT '邮箱地址',
  phone VARCHAR(20) DEFAULT NULL COMMENT '手机号',
  avatar VARCHAR(256) DEFAULT NULL COMMENT '头像URL',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 0-禁用, 1-启用',
  department_id BIGINT DEFAULT NULL COMMENT '部门ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) COMMENT='系统用户表';

CREATE TABLE sys_permission (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '权限ID',
  permission_name VARCHAR(64) NOT NULL COMMENT '权限名称',
  permission_key VARCHAR(128) NOT NULL COMMENT '权限标识',
  resource_type VARCHAR(32) NOT NULL COMMENT '资源类型',
  PRIMARY KEY (id)
) COMMENT='系统权限表';`;

/** 差异类型的标签和颜色 */
const DIFF_TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  "table-added": { label: "新增表", color: "text-emerald-700 dark:text-emerald-300", bgColor: "bg-emerald-50 dark:bg-emerald-900/30" },
  "table-removed": { label: "删除表", color: "text-red-700 dark:text-red-300", bgColor: "bg-red-50 dark:bg-red-900/30" },
  "column-added": { label: "新增列", color: "text-emerald-700 dark:text-emerald-300", bgColor: "bg-emerald-50 dark:bg-emerald-900/30" },
  "column-removed": { label: "删除列", color: "text-red-700 dark:text-red-300", bgColor: "bg-red-50 dark:bg-red-900/30" },
  "column-modified": { label: "修改列", color: "text-amber-700 dark:text-amber-300", bgColor: "bg-amber-50 dark:bg-amber-900/30" },
};

export default function SqlDiffPage() {
  const [sourceSql, setSourceSql] = useState(EXAMPLE_SOURCE_SQL);
  const [targetSql, setTargetSql] = useState(EXAMPLE_TARGET_SQL);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [compared, setCompared] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCompare = useCallback(() => {
    const result = diffSQL(sourceSql, targetSql);
    setDiffResult(result);
    setCompared(true);
  }, [sourceSql, targetSql]);

  const handleCopy = useCallback(async () => {
    if (!diffResult) return;
    await navigator.clipboard.writeText(diffResult.alterSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [diffResult]);

  const handleSwap = useCallback(() => {
    const temp = sourceSql;
    setSourceSql(targetSql);
    setTargetSql(temp);
    setCompared(false);
    setDiffResult(null);
  }, [sourceSql, targetSql]);

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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-lg shadow-lg shadow-emerald-500/25">
              ⚡
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                SQL Diff
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                对比建表 SQL → 生成 ALTER 语句
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* SQL 输入区 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              📝 输入两组建表 SQL
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSwap}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="交换源和目标"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                交换
              </button>
              <button
                onClick={handleCompare}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl hover:shadow-emerald-500/30 hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                对比差异
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 源 SQL */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  源端（旧）
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">作为对比基准</span>
              </div>
              <SqlEditor
                value={sourceSql}
                onChange={(val) => {
                  setSourceSql(val);
                  setCompared(false);
                }}
                placeholder="请输入源端（旧版本）的 CREATE TABLE 语句..."
                height="260px"
              />
            </div>

            {/* 目标 SQL */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  目标端（新）
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">与源端对比</span>
              </div>
              <SqlEditor
                value={targetSql}
                onChange={(val) => {
                  setTargetSql(val);
                  setCompared(false);
                }}
                placeholder="请输入目标端（新版本）的 CREATE TABLE 语句..."
                height="260px"
              />
            </div>
          </div>
        </div>

        {/* 对比结果 */}
        {compared && diffResult && diffResult.hasChanges && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* 左侧：差异列表 */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  🔍 差异明细
                </label>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  共 {diffResult.tableDiffs.length + diffResult.columnDiffs.length} 处差异
                </span>
              </div>

              <div className="space-y-3">
                {/* 表级差异 */}
                {diffResult.tableDiffs.map((diff, i) => (
                  <TableDiffCard key={`table-${i}`} diff={diff} />
                ))}

                {/* 列级差异，按表分组 */}
                {Object.entries(
                  groupBy(diffResult.columnDiffs, (d) => d.tableName)
                ).map(([tableName, diffs]) => (
                  <div key={tableName}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        📋 {tableName}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {diffs.length} 处变更
                      </span>
                    </div>
                    <div className="space-y-2">
                      {diffs.map((diff, i) => (
                        <ColumnDiffCard key={`col-${i}`} diff={diff} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 右侧：生成的 ALTER SQL */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  ⚡ ALTER SQL
                </label>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {copied ? (
                    <>
                      <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      已复制
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      复制 SQL
                    </>
                  )}
                </button>
              </div>
              <CodeViewer
                value={diffResult.alterSql}
                language="sql"
                height="600px"
              />
            </div>
          </div>
        )}

        {/* 无差异 */}
        {compared && diffResult && !diffResult.hasChanges && (
          <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              两组 SQL 完全一致，无差异
            </p>
          </div>
        )}

        {/* 未对比时的提示 */}
        {!compared && (
          <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-4xl mb-3">🚀</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              输入两组 DDL SQL 后，点击「对比差异」按钮开始
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/** 表级差异卡片 */
function TableDiffCard({ diff }: { diff: TableDiff }) {
  const config = DIFF_TYPE_CONFIG[diff.type];
  return (
    <div className={`rounded-lg border border-slate-200 p-3 dark:border-slate-700 ${config.bgColor}`}>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${config.bgColor} ${config.color}`}>
          {config.label}
        </span>
        <code className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">
          {diff.tableName}
        </code>
        {diff.table?.comment && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {diff.table.comment}
          </span>
        )}
      </div>
    </div>
  );
}

/** 列级差异卡片 */
function ColumnDiffCard({ diff }: { diff: ColumnDiff }) {
  const config = DIFF_TYPE_CONFIG[diff.type];
  return (
    <div className={`rounded-lg border border-slate-200 p-3 dark:border-slate-700 ${config.bgColor}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${config.bgColor} ${config.color}`}>
          {config.label}
        </span>
        <code className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">
          {diff.columnName}
        </code>
        {diff.type === "column-added" && diff.targetColumn && (
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {diff.targetColumn.type}
          </span>
        )}
        {diff.type === "column-removed" && diff.sourceColumn && (
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {diff.sourceColumn.type}
          </span>
        )}
      </div>
      {/* 修改列时展示具体变化 */}
      {diff.type === "column-modified" && diff.changes && (
        <div className="mt-2 space-y-1">
          {diff.changes.map((change, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="font-medium text-slate-500 dark:text-slate-400 w-12">
                {change.field}
              </span>
              <span className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-red-600 dark:bg-red-900/20 dark:text-red-400 line-through">
                {change.oldValue}
              </span>
              <svg className="h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                {change.newValue}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 按字段分组 */
function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}
