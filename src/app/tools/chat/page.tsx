import ChatClient from "./ChatClient";

// WebLLM 依赖 WebGPU，纯客户端运行，禁用 SSR（ChatClient 已标记 "use client"）
export default function ChatPage() {
  return <ChatClient />;
}
