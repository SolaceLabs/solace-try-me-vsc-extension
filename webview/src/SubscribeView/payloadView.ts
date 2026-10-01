import solace from "solclientjs";

import { Message } from "../Shared/interfaces";
import { base64ToBytes, bytesToBase64, parseJsonLossless } from "../Shared/messageCodec";

export type PayloadView = "raw" | "pretty" | "hex" | "base64";

export const PAYLOAD_VIEWS: { key: PayloadView; label: string }[] = [
  { key: "raw", label: "Raw" },
  { key: "pretty", label: "Pretty JSON" },
  { key: "hex", label: "Hex" },
  { key: "base64", label: "Base64" },
];

const utf8Encoder = new TextEncoder();
const HEX_LINE = 16;

export const isBinaryPayload = (message: Message) => message.payloadEncoding === "base64";

export const defaultPayloadView = (message: Message): PayloadView => (isBinaryPayload(message) ? "base64" : "raw");

const prettyCache = new WeakMap<Message, { text: string } | { reason: string }>();

/** Pretty-printed JSON, only when that keeps the payload's values exactly (see parseJsonLossless). */
export function prettyJson(message: Message): { text: string } | { reason: string } {
  let result = prettyCache.get(message);
  if (result === undefined) {
    if (isBinaryPayload(message)) {
      result = { reason: "Binary payload: not JSON text." };
    } else {
      const parsed = parseJsonLossless(message.payload);
      if (parsed !== undefined) {
        result = { text: JSON.stringify(parsed, null, 2) };
      } else {
        let isJson = false;
        try {
          JSON.parse(message.payload);
          isJson = /^\s*[[{]/.test(message.payload);
        } catch {
          // Not JSON
        }
        result = {
          reason: isJson
            ? "Pretty-printing would change this payload (large or reformatted numbers, or duplicate keys), so only the raw text is shown."
            : "The payload is not a JSON object or array.",
        };
      }
    }
    prettyCache.set(message, result);
  }
  return result;
}

/** Why Hex and Base64 are not available, or null. */
export function bytesUnavailableReason(message: Message): string | null {
  const type = message.metadata.messageType;
  return type === solace.MessageType.MAP || type === solace.MessageType.STREAM
    ? "Map and Stream payloads are structured data, shown as JSON. There are no raw bytes to show."
    : null;
}

/** Why Raw is not available, or null. */
export function rawUnavailableReason(message: Message): string | null {
  return isBinaryPayload(message) ? "Binary payload that is not valid UTF-8 text. Use Base64 or Hex." : null;
}

/** The first `maxBytes` payload bytes: UTF-8 for text, decoded base64 for binary data. */
export function payloadBytes(message: Message, maxBytes: number): { bytes: Uint8Array; truncated: boolean } {
  const { payload } = message;
  if (isBinaryPayload(message)) {
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    const total = (payload.length / 4) * 3 - padding;
    try {
      const bytes = base64ToBytes(payload.slice(0, Math.ceil(maxBytes / 3) * 4)).subarray(0, maxBytes);
      return { bytes, truncated: total > maxBytes };
    } catch {
      return { bytes: new Uint8Array(), truncated: false };
    }
  }
  // Encodes only what fits: a UTF-16 code unit takes at most 3 UTF-8 bytes.
  const buffer = new Uint8Array(Math.max(0, Math.min(maxBytes, payload.length * 3)));
  const { read, written } = utf8Encoder.encodeInto(payload, buffer);
  return { bytes: buffer.subarray(0, written), truncated: read < payload.length };
}

/** Classic hex dump: offset, 16 bytes per line and their printable ASCII. */
export function hexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += HEX_LINE) {
    const chunk = bytes.subarray(offset, offset + HEX_LINE);
    let hex = "";
    let ascii = "";
    for (let i = 0; i < HEX_LINE; i++) {
      if (i === HEX_LINE / 2) hex += " ";
      if (i < chunk.length) {
        hex += chunk[i].toString(16).padStart(2, "0") + " ";
        ascii += chunk[i] >= 0x20 && chunk[i] < 0x7f ? String.fromCharCode(chunk[i]) : ".";
      } else {
        hex += "   ";
      }
    }
    lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex} |${ascii}|`);
  }
  return lines.join("\n");
}

/** Base64 of the payload bytes, cut to `maxLength` characters. */
export function payloadBase64(message: Message, maxLength: number): { text: string; truncated: boolean } {
  if (isBinaryPayload(message)) {
    return { text: message.payload.slice(0, maxLength), truncated: message.payload.length > maxLength };
  }
  const { bytes, truncated } = payloadBytes(message, Math.ceil(maxLength / 4) * 3);
  const text = bytesToBase64(bytes);
  return text.length > maxLength ? { text: text.slice(0, maxLength), truncated: true } : { text, truncated };
}
