import solace from "solclientjs";
import { host } from "./host";
import { logger } from "./logger";

export type Milestone = "connected" | "subscribed" | "published" | "openedMessage";

/** Lets the Getting Started walkthrough tick off its steps. */
export function reportMilestone(name: Milestone) {
  host.post("milestone", { name });
}

/** Opens content in a VS Code editor. The host decides whether to save it to disk. */
export function openFileInNewTab(
  content: string,
  options: { id?: string; language?: "json" | "xml" | "plaintext"; untitled?: boolean } = {}
) {
  host
    .request("file/open", {
      content,
      id: options.id ?? Date.now().toString(),
      language: options.language ?? "json",
      untitled: options.untitled ?? false,
    })
    .catch((error: Error) => logger.error(`Could not open the message: ${error.message}`));
}

export function copyToClipboard(text: string) {
  return host.request("clipboard/write", { text });
}

/** JSON round-trip drops undefined values, so compare stored and in-memory configs that way. */
export const normalizeForCompare = (value: unknown) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export const deepCompareObjects = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (
      !keysB.includes(key) ||
      !deepCompareObjects(
        (a as { [x: string]: unknown })[key],
        (b as { [x: string]: unknown })[key]
      )
    ) {
      return false;
    }
  }
  return true;
};

export const configsEqual = (a: unknown, b: unknown) =>
  deepCompareObjects(normalizeForCompare(a), normalizeForCompare(b));

export function formatDate(date: Date | number, compactMode = false): string {
  if (typeof date === "number") {
    date = new Date(date);
  }
  const year = compactMode
    ? date.getFullYear().toString().slice(-2)
    : date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = compactMode
    ? ""
    : ":" + String(date.getMilliseconds()).padStart(3, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}${milliseconds}`;
}

export const convertTypeToString = (type: solace.SDTFieldType) => {
  switch (type) {
    case solace.SDTFieldType.BOOL:
      return "Boolean";
    case solace.SDTFieldType.INT8:
    case solace.SDTFieldType.INT16:
    case solace.SDTFieldType.INT32:
    case solace.SDTFieldType.INT64:
    case solace.SDTFieldType.UINT8:
    case solace.SDTFieldType.UINT16:
    case solace.SDTFieldType.UINT32:
    case solace.SDTFieldType.UINT64:
      return "Integer";
    case solace.SDTFieldType.WCHAR:
    case solace.SDTFieldType.STRING:
      return "String";
    case solace.SDTFieldType.FLOATTYPE:
    case solace.SDTFieldType.DOUBLETYPE:
      return "Float";
    case solace.SDTFieldType.BYTEARRAY:
      return "Bytes";
    case solace.SDTFieldType.MAP:
      return "Map";
    case solace.SDTFieldType.STREAM:
      return "Stream";
    case solace.SDTFieldType.DESTINATION:
      return "Destination";
    case solace.SDTFieldType.NULLTYPE:
      return "Null";
    default:
      return "Unknown";
  }
};

/** Display text for a user property or nested SDT value. */
export function formatPropertyValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Clamps a number into [min, max]; NaN and non-finite values become the fallback. */
export function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}
