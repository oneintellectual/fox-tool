"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { parseDDL, TableInfo } from "@/lib/ddl-parser";
import {
  generateCode,
  CodeGenerateConfig,
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  getTargetType,
} from "@/lib/code-generator";

const EXAMPLE_SQL = `CREATE TABLE sys_user (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  username VARCHAR(64) NOT NULL COMMENT '用户名',
  password VARCHAR(128) NOT NULL COMMENT '密码',
  nickname VARCHAR(64) DEFAULT '' COMMENT '昵称',
  email VARCHAR(128) DEFAULT NULL COMMENT '邮箱',
  phone VARCHAR(20) DEFAULT NULL COMMENT '手机号',
  avatar VARCHAR(256) DEFAULT NULL COMMENT '头像URL',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 0-禁用, 1-启用',
  department_id BIGINT DEFAULT NULL COMMENT '部门ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '是否删除: 0-未删除, 1-已删除',
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) COMMENT='系统用户表';

CREATE TABLE sys_role (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '角色ID',
  role_name VARCHAR(64) NOT NULL COMMENT '角色名称',
  role_key VARCHAR(64) NOT NULL COMMENT '角色标识',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 0-禁用, 1-启用',
  remark VARCHAR(256) DEFAULT '' COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id)
) COMMENT='系统角色表';`;

function toCamelCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export default function DdlToCodePage() {
  const [sql, setSql] = useState(EXAMPLE_SQL);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<number>(0);
  const [generatedCode, setGeneratedCode] = useState("");
  const [parsed, setParsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const [config, setConfig] = useState<CodeGenerateConfig>({
    language: "java",
    packageName: "com.example.entity",
    useLombok: true,
    useSwagger: false,
    useMybatisPlus: true,
    author: "",
  });

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.value === config.language)!;

  const handleParse = useCallback(() => {
    const result = parseDDL(sql);
    setTables(result);
    setParsed(true);
    setSelectedTable(0);

    if (result.length > 0) {
      const code = generateCode(result[0], config);
      setGeneratedCode(code);
    } else {
      setGeneratedCode("");
    }
  }, [sql, config]);

  const handleSelectTable = useCallback(
    (index: number) => {
      setSelectedTable(index);
      if (tables[index]) {
        const code = generateCode(tables[index], config);
        setGeneratedCode(code);
      }
    },
    [tables, config]
  );

  const handleRegenerate = useCallback(() => {
    if (tables.length > 0 && tables[selectedTable]) {
      const code = generateCode(tables[selectedTable], config);
      setGeneratedCode(code);
    }
  }, [tables, selectedTable, config]);

  const handleLanguageChange = useCallback(
    (language: SupportedLanguage) => {
      const newConfig = { ...config, language };
      setConfig(newConfig);
      if (tables.length > 0 && tables[selectedTable]) {
        const code = generateCode(tables[selectedTable], newConfig);
        setGeneratedCode(code);
      }
    },
    [config, tables, selectedTable]
  );

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedCode]);

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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-lg shadow-lg shadow-blue-500/25">
              🔧
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                DDL to Code
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                SQL 建表语句 → 多语言代码
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
              📝 DDL SQL 输入
            </label>
            <button
              onClick={handleParse}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:shadow-blue-500/30 hover:from-blue-600 hover:to-indigo-700 active:scale-[0.98]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              解析 SQL
            </button>
          </div>
          <textarea
            value={sql}
            onChange={(e) => {
              setSql(e.target.value);
              setParsed(false);
            }}
            className="w-full h-64 rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm text-slate-800 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-blue-400 dark:focus:ring-blue-400/10 resize-y"
            placeholder="请输入 CREATE TABLE 的 DDL 语句..."
            spellCheck={false}
          />
        </div>

        {/* 解析结果 */}
        {parsed && tables.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* 左侧：字段列表 */}
            <div>
              {/* 表选择 Tab */}
              <div className="mb-4 flex gap-2 flex-wrap">
                {tables.map((table, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectTable(index)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                      selectedTable === index
                        ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25"
                        : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
                    }`}
                  >
                    {table.className}
                    {table.comment && (
                      <span className="ml-1.5 text-xs opacity-70">
                        ({table.comment})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* 字段表格 */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                        <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">字段名</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">SQL 类型</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">{currentLang.label} 类型</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">属性名</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">注释</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">PK</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">可空</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables[selectedTable]?.columns.map((col, i) => (
                        <tr
                          key={i}
                          className="border-b border-slate-50 transition-colors hover:bg-blue-50/50 dark:border-slate-800/50 dark:hover:bg-blue-900/10"
                        >
                          <td className="px-4 py-2.5">
                            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {col.name}
                            </code>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs font-mono text-orange-600 dark:text-orange-400">
                              {col.type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                              {getTargetType(col.type, config.language)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <code className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                              {toCamelCase(col.name)}
                            </code>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                            {col.comment || "-"}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {col.primaryKey ? (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                                🔑
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {col.nullable ? (
                              <span className="text-green-500">✓</span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">✗</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 配置区 */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  ⚙️ 生成配置
                </h3>

                {/* 语言选择 */}
                <div className="mb-3">
                  <label className="mb-1.5 block text-xs text-slate-500 dark:text-slate-400">目标语言</label>
                  <div className="flex gap-2">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <button
                        key={lang.value}
                        onClick={() => handleLanguageChange(lang.value)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                          config.language === lang.value
                            ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        }`}
                      >
                        <span>{lang.icon}</span>
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Java 专属配置 */}
                {config.language === "java" && (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">包名</label>
                        <input
                          type="text"
                          value={config.packageName}
                          onChange={(e) => setConfig({ ...config, packageName: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">作者</label>
                        <input
                          type="text"
                          value={config.author}
                          onChange={(e) => setConfig({ ...config, author: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          placeholder="可选"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={config.useLombok}
                          onChange={(e) => setConfig({ ...config, useLombok: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                        />
                        Lombok (@Data)
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={config.useMybatisPlus}
                          onChange={(e) => setConfig({ ...config, useMybatisPlus: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                        />
                        MyBatis-Plus 注解
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={config.useSwagger}
                          onChange={(e) => setConfig({ ...config, useSwagger: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                        />
                        Swagger 注解
                      </label>
                    </div>
                  </>
                )}

                <button
                  onClick={handleRegenerate}
                  className="mt-3 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  🔄 重新生成
                </button>
              </div>
            </div>

            {/* 右侧：生成代码 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {currentLang.icon} {currentLang.label} 代码
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
                      复制代码
                    </>
                  )}
                </button>
              </div>
              <pre className="overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-4 text-sm leading-relaxed shadow-sm max-h-[600px]">
                <code className="text-slate-100 font-mono whitespace-pre">
                  {generatedCode}
                </code>
              </pre>
            </div>
          </div>
        )}

        {/* 解析无结果 */}
        {parsed && tables.length === 0 && (
          <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-4xl mb-3">🤔</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              未检测到有效的 CREATE TABLE 语句，请检查 SQL 格式
            </p>
          </div>
        )}

        {/* 未解析时的提示 */}
        {!parsed && (
          <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-4xl mb-3">🚀</div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              输入 DDL SQL 语句后，点击「解析 SQL」按钮开始
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
