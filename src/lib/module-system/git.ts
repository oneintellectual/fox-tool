import fs from "fs";
import path from "path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { removeDir } from "./paths";

/** 远程引用（分支/tag）信息 */
export interface RemoteRef {
  ref: string;
  /** 简短名称，如 "main"、"v1.0.0" */
  short: string;
  /** 提交 SHA */
  oid: string;
  /** 类型 */
  type: "branch" | "tag" | "head";
}

export interface CloneOptions {
  url: string;
  /** 目标目录（需不存在或为空） */
  dir: string;
  /** 分支/tag/commit，默认 HEAD */
  ref?: string;
  /** 私有仓库鉴权 token（HTTPS Basic，username=token） */
  token?: string;
  /** 是否浅克隆，默认 true */
  shallow?: boolean;
}

/** 构建 isomorphic-git 的 onAuth 回调（无 token 返回 undefined） */
function buildOnAuth(token?: string) {
  if (!token) return undefined;
  return () => ({ username: token, password: "x-oauth-basic" });
}

/** 列出远程仓库的分支与 tag（用于版本选择） */
export async function listRemoteRefs(url: string, token?: string): Promise<RemoteRef[]> {
  const result = await git.listServerRefs({
    http,
    url,
    forPush: false,
    onAuth: buildOnAuth(token),
  });
  const refs: RemoteRef[] = [];
  for (const r of result) {
    if (r.ref === "HEAD") {
      refs.push({ ref: r.ref, short: "HEAD", oid: r.oid, type: "head" });
    } else if (r.ref.startsWith("refs/heads/")) {
      refs.push({
        ref: r.ref,
        short: r.ref.slice("refs/heads/".length),
        oid: r.oid,
        type: "branch",
      });
    } else if (r.ref.startsWith("refs/tags/")) {
      refs.push({
        ref: r.ref,
        short: r.ref.slice("refs/tags/".length),
        oid: r.oid,
        type: "tag",
      });
    }
  }
  // HEAD 置顶，其余按名称排序
  refs.sort((a, b) => {
    if (a.type === "head") return -1;
    if (b.type === "head") return 1;
    return a.short.localeCompare(b.short, undefined, { numeric: true });
  });
  return refs;
}

/** 克隆仓库到指定目录 */
export async function cloneRepo(opts: CloneOptions): Promise<{ oid: string }> {
  const { url, dir, ref = "HEAD", token, shallow = true } = opts;

  // 目标目录必须不存在或为空
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    removeDir(dir);
  }
  fs.mkdirSync(dir, { recursive: true });

  await git.clone({
    fs,
    http,
    dir,
    url,
    ref: ref === "HEAD" ? undefined : ref,
    singleBranch: true,
    depth: shallow ? 1 : undefined,
    onAuth: buildOnAuth(token),
  });

  const oid = await git.resolveRef({ fs, dir, ref: "HEAD" });
  return { oid };
}

/** 切换到指定 ref（用于更新时切换版本） */
export async function checkoutRef(dir: string, ref: string, token?: string, url?: string): Promise<{ oid: string }> {
  // isomorphic-git checkout 需要本地已有 refs；若切换到新 ref，需先 fetch
  if (url) {
    await git.fetch({
      fs,
      http,
      dir,
      url,
      ref,
      depth: 1,
      onAuth: buildOnAuth(token),
    });
  }
  await git.checkout({ fs, dir, ref });
  const oid = await git.resolveRef({ fs, dir, ref: "HEAD" });
  return { oid };
}

/** 读取仓库当前 HEAD commit */
export async function currentHead(dir: string): Promise<string> {
  return git.resolveRef({ fs, dir, ref: "HEAD" });
}

/** 读取仓库内文件内容（UTF-8） */
export function readFileInRepo(dir: string, relPath: string): string | null {
  const full = path.join(dir, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf-8");
}
