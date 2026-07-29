/**
 * SSH 监控模块（仅服务端使用）
 * 通过 SSH 连接 Linux 服务器，执行命令并解析监控数据
 *
 * 注意：本文件依赖 ssh2（含原生绑定），不得被客户端组件直接导入。
 * 类型与纯工具函数位于 ./ssh-monitor-types，可被客户端安全导入。
 */

import { Client, ClientChannel } from "ssh2";
import type {
  SshConfig,
  SystemInfo,
  CpuInfo,
  MemoryInfo,
  DiskPartition,
  NetworkInterface,
  ProcessInfo,
  MonitorMetrics,
  ConnectionTestResult,
} from "./ssh-monitor-types";

// 重新导出类型，便于服务端代码统一从此处导入
export type {
  SshConfig,
  SystemInfo,
  CpuInfo,
  MemoryInfo,
  DiskPartition,
  NetworkInterface,
  ProcessInfo,
  MonitorMetrics,
  ConnectionTestResult,
};
export { formatBytes, formatKB } from "./ssh-monitor-types";

/**
 * 创建 SSH 连接
 */
function connectSSH(config: SshConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const connectConfig: Record<string, unknown> = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 10000,
      keepaliveInterval: 0,
    };

    if (config.privateKey) {
      connectConfig.privateKey = config.privateKey;
      if (config.passphrase) connectConfig.passphrase = config.passphrase;
    } else if (config.password) {
      connectConfig.password = config.password;
    } else {
      reject(new Error("必须提供 password 或 privateKey"));
      return;
    }

    conn.on("ready", () => resolve(conn));
    conn.on("error", (err) => reject(err));
    conn.connect(connectConfig);
  });
}

/**
 * 在 SSH 连接上执行命令
 */
function execCommand(conn: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err: Error | undefined, stream: ClientChannel) => {
      if (err) {
        reject(err);
        return;
      }
      let stdout = "";
      let stderr = "";
      stream.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      stream.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      stream.on("close", () => {
        if (stderr && !stdout) {
          reject(new Error(stderr.trim()));
        } else {
          resolve(stdout);
        }
      });
    });
  });
}

/**
 * 测试 SSH 连接
 */
export async function testConnection(config: SshConfig): Promise<ConnectionTestResult> {
  let conn: Client | null = null;
  try {
    conn = await connectSSH(config);
    const hostname = await execCommand(conn, "hostname");
    return {
      success: true,
      message: "连接成功",
      hostname: hostname.trim(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
  } finally {
    if (conn) conn.end();
  }
}

/**
 * 解析 uptime（秒）为可读字符串
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  parts.push(`${minutes}分钟`);
  return parts.join(" ");
}

/**
 * 解析系统信息
 */
function parseSystemInfo(raw: string): SystemInfo {
  const lines = raw.trim().split("\n");
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      fields[key] = val;
    }
  }

  const uptimeSeconds = parseFloat(fields["UPTIME_SECONDS"] || "0") || 0;
  return {
    hostname: fields["HOSTNAME"] || "unknown",
    os: fields["OS"] || "",
    kernel: fields["KERNEL"] || "",
    release: fields["RELEASE"] || "",
    uptime: uptimeSeconds,
    uptimeStr: formatUptime(uptimeSeconds),
    bootTime: fields["BOOT_TIME"] || "",
    serverTime: fields["SERVER_TIME"] || "",
  };
}

/**
 * 解析 CPU 信息
 */
function parseCpuInfo(raw: string): CpuInfo {
  const lines = raw.trim().split("\n");
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      fields[key] = val;
    }
  }

  const loadParts = (fields["LOADAVG"] || "0 0 0").split(/\s+/);
  return {
    model: fields["CPU_MODEL"] || "unknown",
    cores: parseInt(fields["CPU_CORES"] || "1", 10) || 1,
    loadAvg1: parseFloat(loadParts[0] || "0") || 0,
    loadAvg5: parseFloat(loadParts[1] || "0") || 0,
    loadAvg15: parseFloat(loadParts[2] || "0") || 0,
    usagePercent: parseFloat(fields["CPU_USAGE"] || "0") || 0,
  };
}

/**
 * 解析内存信息
 */
function parseMemoryInfo(raw: string): MemoryInfo {
  const lines = raw.trim().split("\n");
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      fields[key] = val;
    }
  }

  const total = parseInt(fields["MEM_TOTAL"] || "0", 10) || 0;
  const available = parseInt(fields["MEM_AVAILABLE"] || "0", 10) || 0;
  const free = parseInt(fields["MEM_FREE"] || "0", 10) || 0;
  const cached = parseInt(fields["MEM_CACHED"] || "0", 10) || 0;
  const buffers = parseInt(fields["MEM_BUFFERS"] || "0", 10) || 0;
  const used = total - available;
  const swapTotal = parseInt(fields["SWAP_TOTAL"] || "0", 10) || 0;
  const swapUsed = parseInt(fields["SWAP_USED"] || "0", 10) || 0;

  return {
    total,
    used,
    free,
    available,
    cached,
    buffers,
    swapTotal,
    swapUsed,
    usagePercent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
  };
}

/**
 * 解析磁盘信息
 */
function parseDiskInfo(raw: string): DiskPartition[] {
  const lines = raw.trim().split("\n").filter((l) => l.trim());
  const disks: DiskPartition[] = [];
  // 跳过表头
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length < 7) continue;
    // 文件系统 容量 已用 可用 使用% 挂载点 类型
    // 兼容 df -hPT 输出
    const filesystem = parts[0];
    const total = parseSize(parts[1]);
    const used = parseSize(parts[2]);
    const free = parseSize(parts[3]);
    const usagePercent = parseFloat(parts[4].replace("%", "")) || 0;
    const mount = parts[5];
    const type = parts[6] || "";
    disks.push({ filesystem, mount, type, total, used, free, usagePercent });
  }
  return disks;
}

/**
 * 解析带单位的大小（KB/MB/GB/TB）为 KB
 */
function parseSize(s: string): number {
  if (!s) return 0;
  const m = s.match(/^([\d.]+)([KMGT]?B?|B)$/i);
  if (!m) return parseInt(s, 10) || 0;
  const num = parseFloat(m[1]) || 0;
  const unit = (m[2] || "").toUpperCase();
  switch (unit) {
    case "KB":
    case "K":
      return Math.round(num * 1024);
    case "MB":
    case "M":
      return Math.round(num * 1024 * 1024);
    case "GB":
    case "G":
      return Math.round(num * 1024 * 1024 * 1024);
    case "TB":
    case "T":
      return Math.round(num * 1024 * 1024 * 1024 * 1024);
    default:
      return Math.round(num); // 默认字节
  }
}

/**
 * 解析网络接口信息
 */
function parseNetworkInfo(raw: string): NetworkInterface[] {
  const lines = raw.trim().split("\n").filter((l) => l.trim());
  const interfaces: NetworkInterface[] = [];
  // 跳过表头
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length < 5) continue;
    interfaces.push({
      name: parts[0],
      rxBytes: parseInt(parts[1], 10) || 0,
      txBytes: parseInt(parts[2], 10) || 0,
      rxPackets: parseInt(parts[3], 10) || 0,
      txPackets: parseInt(parts[4], 10) || 0,
      ip: parts[5] || "",
    });
  }
  return interfaces;
}

/**
 * 解析进程信息
 */
function parseProcesses(raw: string): ProcessInfo[] {
  const lines = raw.trim().split("\n").filter((l) => l.trim());
  const processes: ProcessInfo[] = [];
  // 跳过表头
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length < 5) continue;
    processes.push({
      pid: parseInt(parts[0], 10) || 0,
      user: parts[1],
      cpu: parseFloat(parts[2]) || 0,
      mem: parseFloat(parts[3]) || 0,
      command: parts.slice(4).join(" "),
    });
  }
  return processes;
}

/**
 * 获取所有监控指标
 * 一次 SSH 连接执行多个命令，减少连接开销
 */
export async function getMetrics(config: SshConfig): Promise<MonitorMetrics> {
  let conn: Client | null = null;
  try {
    conn = await connectSSH(config);

    // 使用一段 shell 脚本采集所有指标，通过分隔符区分各部分输出
    const script = `echo "===SYSTEM===";
echo "HOSTNAME:$(hostname)";
echo "OS:$(uname -s)";
echo "KERNEL:$(uname -r)";
echo "RELEASE:$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')";
echo "UPTIME_SECONDS:$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)";
echo "BOOT_TIME:$(date -d "@$(awk '{print $1}' /proc/stat 2>/dev/null)" 2>/dev/null || uptime -s 2>/dev/null || echo unknown)";
echo "SERVER_TIME:$(date '+%Y-%m-%d %H:%M:%S %Z')";

echo "===CPU===";
echo "CPU_MODEL:$(awk -F: '/model name/ {print $2; exit}' /proc/cpuinfo 2>/dev/null | sed 's/^ *//')";
echo "CPU_CORES:$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 1)";
echo "LOADAVG:$(cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}' || uptime | awk -F'load average:' '{print $2}' | sed 's/,//g' | sed 's/^ *//')";
# 计算 CPU 使用率：采样 1 秒
CPU_USAGE=$(awk -v a="$(awk '{print $4}' /proc/stat | head -n1)" 'BEGIN{print a}' > /tmp/_cpu_a; sleep 1; awk '{print $4}' /proc/stat | head -n1 > /tmp/_cpu_b; A=$(cat /tmp/_cpu_a); B=$(cat /tmp/_cpu_b); if (B == A) print 0; else printf "%.1f", 100 - (B - A) * 100 / 100);
echo "CPU_USAGE:$CPU_USAGE";

echo "===MEMORY===";
echo "MEM_TOTAL:$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null)";
echo "MEM_FREE:$(awk '/MemFree/ {print $2}' /proc/meminfo 2>/dev/null)";
echo "MEM_AVAILABLE:$(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null)";
echo "MEM_CACHED:$(awk '/Cached/ {print $2}' /proc/meminfo 2>/dev/null | head -n1)";
echo "MEM_BUFFERS:$(awk '/Buffers/ {print $2}' /proc/meminfo 2>/dev/null)";
echo "SWAP_TOTAL:$(awk '/SwapTotal/ {print $2}' /proc/meminfo 2>/dev/null)";
echo "SWAP_USED:$(awk '/SwapFree/ {print $2}' /proc/meminfo 2>/dev/null)";

echo "===DISK===";
df -hPT 2>/dev/null | awk 'NR==1 || ($2 ~ /ext|xfs|btrfs|zfs|tmpfs|overlay/)' | awk '{print $1, $3, $4, $5, $6, $7, $2}';

echo "===NETWORK===";
# 列出接口及 rx/tx 字节数和包数
for iface in $(ls /sys/class/net/ 2>/dev/null); do
  RX_B=$(cat /sys/class/net/$iface/statistics/rx_bytes 2>/dev/null || echo 0);
  TX_B=$(cat /sys/class/net/$iface/statistics/tx_bytes 2>/dev/null || echo 0);
  RX_P=$(cat /sys/class/net/$iface/statistics/rx_packets 2>/dev/null || echo 0);
  TX_P=$(cat /sys/class/net/$iface/statistics/tx_packets 2>/dev/null || echo 0);
  IP=$(ip -4 addr show $iface 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1 | head -n1);
  echo "$iface $RX_B $TX_B $RX_P $TX_P \${IP:-}";
done;

echo "===PROCESSES===";
ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu 2>/dev/null | head -n 16;

echo "===END===";`;

    const output = await execCommand(conn, script);

    // 按分隔符切分各部分
    const sections: Record<string, string> = {};
    const sectionRegex = /===([A-Z_]+)===\n([\s\S]*?)(?====[A-Z_]+===|$)/g;
    let m: RegExpExecArray | null;
    while ((m = sectionRegex.exec(output)) !== null) {
      sections[m[1]] = m[2];
    }

    const system = parseSystemInfo(sections["SYSTEM"] || "");
    const cpu = parseCpuInfo(sections["CPU"] || "");
    const memory = parseMemoryInfo(sections["MEMORY"] || "");
    const disks = parseDiskInfo(sections["DISK"] || "");
    const networks = parseNetworkInfo(sections["NETWORK"] || "");
    const processes = parseProcesses(sections["PROCESSES"] || "");

    return {
      system,
      cpu,
      memory,
      disks,
      networks,
      processes,
      fetchedAt: Date.now(),
    };
  } finally {
    if (conn) conn.end();
  }
}
