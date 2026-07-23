import Link from "next/link";

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  gradient: string;
  shadowColor: string;
  href: string;
  tags: string[];
}

const tools: Tool[] = [
  {
    id: "ddl-to-code",
    name: "DDL to Code",
    description: "解析 SQL 建表语句，自动生成多语言代码，支持 Java 实体类（Lombok、MyBatis-Plus、Swagger 注解）",
    icon: "🔧",
    gradient: "from-blue-500 to-indigo-600",
    shadowColor: "shadow-blue-500/20",
    href: "/tools/ddl-to-code",
    tags: ["SQL", "Java", "代码生成"],
  },
  {
    id: "sql-diff",
    name: "SQL Diff",
    description: "对比两组建表 SQL 差异，自动生成 ALTER TABLE 语句，支持新增表、删除表、新增列、删除列、修改列",
    icon: "⚡",
    gradient: "from-emerald-500 to-teal-600",
    shadowColor: "shadow-emerald-500/20",
    href: "/tools/sql-diff",
    tags: ["SQL", "对比", "ALTER"],
  },
  {
    id: "coming-soon-1",
    name: "JSON 格式化",
    description: "JSON 数据格式化、压缩、校验与转换工具",
    icon: "{ }",
    gradient: "from-emerald-500 to-teal-600",
    shadowColor: "shadow-emerald-500/20",
    href: "#",
    tags: ["JSON", "格式化"],
  },
  {
    id: "coming-soon-2",
    name: "Base64 编解码",
    description: "文本与 Base64 互转，支持文件编码",
    icon: "🔐",
    gradient: "from-amber-500 to-orange-600",
    shadowColor: "shadow-amber-500/20",
    href: "#",
    tags: ["编码", "解码"],
  },
  {
    id: "coming-soon-3",
    name: "正则测试",
    description: "在线正则表达式测试与匹配验证",
    icon: ".*",
    gradient: "from-violet-500 to-purple-600",
    shadowColor: "shadow-violet-500/20",
    href: "#",
    tags: ["正则", "测试"],
  },
  {
    id: "coming-soon-4",
    name: "时间戳转换",
    description: "Unix 时间戳与日期时间互转",
    icon: "⏱",
    gradient: "from-rose-500 to-pink-600",
    shadowColor: "shadow-rose-500/20",
    href: "#",
    tags: ["时间", "转换"],
  },
  {
    id: "coming-soon-5",
    name: "颜色转换",
    description: "HEX、RGB、HSL 颜色格式互转与色板",
    icon: "🎨",
    gradient: "from-cyan-500 to-sky-600",
    shadowColor: "shadow-cyan-500/20",
    href: "#",
    tags: ["颜色", "设计"],
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/60 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/60">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 text-white font-bold text-xl shadow-lg shadow-orange-500/25">
              🦊
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Fox Tool
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                开发者工具箱 · 效率提升利器
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* 分类标题 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            全部工具
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            选择一个工具开始使用
          </p>
        </div>

        {/* 工具卡片网格 */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const isAvailable = ["ddl-to-code", "sql-diff"].includes(tool.id);

            if (isAvailable) {
              return (
                <Link
                  key={tool.id}
                  href={tool.href}
                  className={`group relative flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-200 dark:border-slate-700/80 dark:bg-slate-900 hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5 dark:hover:border-slate-600 cursor-pointer`}
                >
                  <div
                    className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${tool.gradient} text-white text-xl font-bold shadow-lg ${tool.shadowColor}`}
                  >
                    {tool.icon}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {tool.name}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {tool.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {tool.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="absolute right-5 top-6 text-slate-300 transition-all group-hover:text-blue-500 group-hover:translate-x-0.5 dark:text-slate-600 dark:group-hover:text-blue-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            }

            return (
              <div
                key={tool.id}
                className="group relative flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-200 dark:border-slate-700/80 dark:bg-slate-900 opacity-60 cursor-default"
              >
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${tool.gradient} text-white text-xl font-bold shadow-lg ${tool.shadowColor}`}
                >
                  {tool.icon}
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {tool.name}
                  <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    即将上线
                  </span>
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {tool.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {tool.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200/60 bg-white/40 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-950/40">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Fox Tool · 开发者工具箱 · Made with ❤️
          </p>
        </div>
      </footer>
    </div>
  );
}
