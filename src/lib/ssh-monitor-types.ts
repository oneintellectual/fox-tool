/**
 * SSH 监控 - 类型定义与纯工具函数
 *
 * 本文件不引入任何 Node.js / SSH 专有依赖，
 * 可被客户端组件安全导入。SSH 实现位于 ssh-monitor.ts。
 */

/** SSH 连接配置 */
export interface SshConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

/** 系统信息 */
export interface SystemInfo {
  hostname: string;
  os: string;
  kernel: string;
  release: string;
  uptime: number; // 秒
  uptimeStr: string;
  bootTime: string;
  serverTime: string;
}

/** CPU 信息 */
export interface CpuInfo {
  model: string;
  cores: number;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
  usagePercent: number; // 0-100
}

/** 内存信息 */
export interface MemoryInfo {
  total: number; // KB
  used: number;
  free: number;
  available: number;
  cached: number;
  buffers: number;
  swapTotal: number;
  swapUsed: number;
  usagePercent: number;
}

/** 磁盘分区信息 */
export interface DiskPartition {
  filesystem: string;
  mount: string;
  type: string;
  total: number; // KB
  used: number;
  free: number;
  usagePercent: number;
}

/** 网络接口信息 */
export interface NetworkInterface {
  name: string;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  ip: string;
}

/** 进程信息 */
export interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  command: string;
}

/** 完整的监控数据 */
export interface MonitorMetrics {
  system: SystemInfo;
  cpu: CpuInfo;
  memory: MemoryInfo;
  disks: DiskPartition[];
  networks: NetworkInterface[];
  processes: ProcessInfo[];
  fetchedAt: number;
}

/** SSH 连接测试结果 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  hostname?: string;
}

/**
 * 字节数转可读字符串
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * KB 数转可读字符串
 */
export function formatKB(kb: number, decimals = 2): string {
  return formatBytes(kb * 1024, decimals);
}
