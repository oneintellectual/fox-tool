import { notFound } from "next/navigation";
import { findModuleByModuleId } from "@/lib/module-system";
import ModuleRenderer from "./ModuleRenderer";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ModuleToolPage({ params }: Props) {
  const { id } = await params;
  const row = findModuleByModuleId(id);
  if (!row) notFound();
  if (row.status !== "active") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="text-4xl">⏸</div>
          <p className="mt-3 text-slate-600 dark:text-slate-400">该模块未激活</p>
          <a href="/modules" className="mt-4 inline-block text-blue-600 hover:underline">
            返回模块管理
          </a>
        </div>
      </div>
    );
  }

  return <ModuleRenderer moduleId={row.module_id} version={row.version} />;
}
