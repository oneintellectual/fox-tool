import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // esbuild / isomorphic-git / better-sqlite3 / ssh2 为 Node 原生模块，
  // 不应被 Turbopack 打包到客户端 bundle
  serverExternalPackages: ["esbuild", "isomorphic-git", "better-sqlite3", "ssh2"],
  // 显式指定 Turbopack 根目录，避免因检测到多个 lockfile
  // （上层目录 /Users/liuwei/package-lock.json）而误将上层目录作为 workspace root，
  // 导致 NFT (Node File Trace) 扫描整个用户目录
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
