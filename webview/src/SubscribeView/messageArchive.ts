import { strToU8, zipSync, Zippable } from "fflate";

import { Message } from "../Shared/interfaces";
import { bytesToBase64, toExportable } from "../Shared/messageCodec";
import { host } from "../Shared/host";
import {
  archiveEntryName,
  defaultArchiveName,
  MAX_ZIP_BYTES,
  uniqueEntryName,
} from "../../../src/shared/messageArchive";

// The host shows a save dialog, which waits for the user.
const SAVE_TIMEOUT = 10 * 60 * 1000;
// fflate only accepts file dates from 1980 to 2099.
const MIN_ZIP_TIME = Date.UTC(1980, 0, 2);
const MAX_ZIP_TIME = Date.UTC(2099, 11, 31);

/**
 * Builds a ZIP with one JSON file per message, holding exactly what "Open in VS Code" shows.
 * Synchronous on purpose: the webview CSP allows no workers, which fflate's async API needs.
 */
export function buildMessagesZip(messages: Message[]): Uint8Array {
  const width = Math.max(4, String(messages.length).length);
  const used = new Set<string>();
  const files: Zippable = {};
  messages.forEach((message, index) => {
    const receivedAt = message.metadata.receiverTimestamp;
    const name = uniqueEntryName(archiveEntryName(index, width, message.topic, receivedAt), used);
    const content = strToU8(JSON.stringify(toExportable(message), null, 2));
    files[name] =
      receivedAt >= MIN_ZIP_TIME && receivedAt <= MAX_ZIP_TIME ? [content, { mtime: receivedAt }] : content;
  });
  return zipSync(files, { level: 6 });
}

/** Builds the archive and asks the host to save it. Resolves with saved: false when cancelled. */
export async function saveMessagesZip(messages: Message[]): Promise<{ saved: boolean; path?: string }> {
  const zip = buildMessagesZip(messages);
  if (zip.length > MAX_ZIP_BYTES) {
    throw new Error(`The archive would be larger than ${MAX_ZIP_BYTES / 1024 / 1024} MB. Export fewer messages.`);
  }
  return host.request(
    "file/saveZip",
    { fileName: defaultArchiveName(), base64: bytesToBase64(zip), count: messages.length },
    SAVE_TIMEOUT
  );
}
