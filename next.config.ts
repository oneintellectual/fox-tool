import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // esbuild / isomorphic-git / better-sqlite3 为 Node 原生模块，
  // 不应被 Turbopack 打包到客户端 bundle
  serverExternalPackages: ["esbuild", "isomorphic-git", "better-sqlite3", "ssh2"],
};

export default nextConfig;
