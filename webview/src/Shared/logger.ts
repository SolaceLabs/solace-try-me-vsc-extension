import { host } from "./host";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  role?: string;
}

const FLUSH_INTERVAL = 250;
const MAX_BUFFER = 500;

let buffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  flushTimer = undefined;
  if (!buffer.length) return;
  const entries = buffer;
  buffer = [];
  host.post("log", { entries });
}

function write(level: LogLevel, message: string, role?: string) {
  if (buffer.length >= MAX_BUFFER) {
    buffer.shift();
  }
  buffer.push({ level, message, role });
  if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_INTERVAL);
  }
}

/**
 * Logs to the "Solace Try Me" output channel in VS Code. Never pass passwords or
 * full payloads here.
 */
export function createLogger(role?: string) {
  return {
    trace: (message: string) => write("trace", message, role),
    debug: (message: string) => write("debug", message, role),
    info: (message: string) => write("info", message, role),
    warn: (message: string) => write("warn", message, role),
    error: (message: string) => write("error", message, role),
  };
}

export type Logger = ReturnType<typeof createLogger>;

export const logger = createLogger();

window.addEventListener("pagehide", flush);
