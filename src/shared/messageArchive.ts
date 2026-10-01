/**
 * Names and limits for the "Export as ZIP" archives of received messages.
 *
 * Shared by the webview, which builds the archive, and the extension host, which validates
 * and saves it. It must stay free of imports so both the Node and the Vite builds can compile it.
 */

/** Largest archive the host accepts, in bytes. */
export const MAX_ZIP_BYTES = 100 * 1024 * 1024;
export const MAX_ZIP_BASE64_LENGTH = Math.ceil(MAX_ZIP_BYTES / 3) * 4;

const MAX_TOPIC_PART = 80;
const MAX_FILE_NAME = 200;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
// Local file header, or the end of central directory record of an empty archive.
const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
];

/** An ISO timestamp that is safe in file names on every OS: 2026-10-01T14-17-28-124Z. */
export function fileTimestamp(time: number): string {
  const date = new Date(time);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace(/[:.]/g, "-") : "unknown-time";
}

/** Keeps letters, digits, "_", "." and "-"; every other run of characters becomes "-". */
export function sanitizeFileNamePart(value: string, maxLength = MAX_TOPIC_PART): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, maxLength)
    .replace(/[-.]+$/, "");
  return cleaned || "message";
}

/** e.g. 0001_orders-created_2026-10-01T14-17-28-124Z.json */
export function archiveEntryName(index: number, width: number, topic: string, receivedAt: number): string {
  const number = String(index + 1).padStart(width, "0");
  return `${number}_${sanitizeFileNamePart(topic)}_${fileTimestamp(receivedAt)}.json`;
}

/** Appends -2, -3, ... before the extension until the name is not in `used`, then records it. */
export function uniqueEntryName(name: string, used: Set<string>): string {
  let candidate = name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  // Compared without case: archives are often extracted on case-insensitive file systems.
  for (let attempt = 2; used.has(candidate.toLowerCase()); attempt++) {
    candidate = `${stem}-${attempt}${extension}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function defaultArchiveName(now = Date.now()): string {
  return `solace-try-me-messages-${fileTimestamp(now)}.zip`;
}

export interface SaveZipRequest {
  fileName: string;
  base64: string;
  count?: number;
}

/** Validates a `file/saveZip` request from the webview. Throws a readable Error. */
export function validateSaveZipRequest(params: Record<string, unknown>): SaveZipRequest {
  const { fileName, base64, count } = params;
  if (typeof fileName !== "string" || !fileName) {
    throw new Error("The archive needs a file name.");
  }
  if (
    fileName.length > MAX_FILE_NAME ||
    !/\.zip$/i.test(fileName) ||
    /[\\/:*?"<>|]/.test(fileName) ||
    [...fileName].some((ch) => ch.charCodeAt(0) < 0x20) ||
    fileName.startsWith(".")
  ) {
    throw new Error(`Invalid archive file name: ${fileName.slice(0, MAX_FILE_NAME)}`);
  }
  if (typeof base64 !== "string" || !base64) {
    throw new Error("The archive content is missing.");
  }
  if (base64.length > MAX_ZIP_BASE64_LENGTH) {
    throw new Error(`The archive is larger than ${MAX_ZIP_BYTES / 1024 / 1024} MB. Export fewer messages.`);
  }
  if (base64.length % 4 !== 0 || !BASE64_PATTERN.test(base64)) {
    throw new Error("The archive content is not valid base64.");
  }
  return {
    fileName,
    base64,
    count: typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : undefined,
  };
}

/** True when the bytes start with a ZIP signature. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return ZIP_SIGNATURES.some((signature) => signature.every((byte, i) => bytes[i] === byte));
}
