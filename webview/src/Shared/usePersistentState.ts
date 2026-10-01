import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { host } from "./host";

/**
 * UI state that survives the webview being re-created (hiding and showing the view,
 * reloading the window). Stored per webview with vscode.setState.
 */
let cache: Record<string, unknown> | undefined;
let writeTimer: ReturnType<typeof setTimeout> | undefined;

const read = () => {
  if (!cache) {
    const stored = host.getState<unknown>();
    cache = stored && typeof stored === "object" ? { ...(stored as Record<string, unknown>) } : {};
  }
  return cache;
};

const flush = () => {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = undefined;
  if (cache) host.setState(cache);
};

const write = (key: string, value: unknown) => {
  cache = { ...read(), [key]: value };
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flush, 200);
};

window.addEventListener("pagehide", flush);

export function readPersistentState<T>(key: string): T | undefined {
  return read()[key] as T | undefined;
}

export function usePersistentState<T>(
  key: string,
  initial: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stored = read()[key];
    if (stored !== undefined) return stored as T;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    write(key, value);
  }, [key, value]);
  return [value, setValue];
}
