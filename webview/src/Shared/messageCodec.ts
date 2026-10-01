import solace, { SolclientFactory } from "solclientjs";
import {
  Message,
  MessageMetadata,
  MessageSource,
  PublishOptions,
  UserPropertiesMap,
} from "./interfaces";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const utf8Encoder = new TextEncoder();

/** INT64 user properties are encoded in 48 bits by solclientjs. */
export const MIN_INT64_PROPERTY = -(2 ** 47);
export const MAX_INT64_PROPERTY = 2 ** 48 - 1;

const MAX_SDT_DEPTH = 32;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBytes(value: unknown): Uint8Array | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === "string") {
    // Older profiles return binary data as a latin1 string, one byte per character.
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
    return bytes;
  }
  return null;
}

/** UTF-8 text when the bytes are valid UTF-8, base64 otherwise. */
export function decodeBytes(bytes: Uint8Array): { text: string; encoding: "text" | "base64" } {
  try {
    return { text: utf8Decoder.decode(bytes), encoding: "text" };
  } catch {
    return { text: bytesToBase64(bytes), encoding: "base64" };
  }
}

function destinationToString(destination: solace.Destination) {
  const type = destination.getType();
  const label =
    type === solace.DestinationType.QUEUE
      ? "Queue"
      : type === solace.DestinationType.TEMPORARY_QUEUE
      ? "Temporary Queue"
      : "Topic";
  return `[${label} ${destination.getName()}]`;
}

/** Converts an SDT field into a plain, JSON-safe value. Never throws. */
export function sdtFieldToJs(field: solace.SDTField | null | undefined, depth = 0): unknown {
  if (!field) return null;
  if (depth > MAX_SDT_DEPTH) return "<nested too deeply>";
  let value: unknown;
  try {
    value = field.getValue();
  } catch (error) {
    // e.g. 64-bit integers that need more than 48 bits.
    return `<unsupported value: ${(error as Error)?.message ?? error}>`;
  }
  switch (field.getType()) {
    case solace.SDTFieldType.MAP: {
      const map = value as solace.SDTMapContainer | null;
      const result: Record<string, unknown> = {};
      if (!map) return result;
      for (const key of map.getKeys()) {
        result[key] = sdtFieldToJs(map.getField(key), depth + 1);
      }
      return result;
    }
    case solace.SDTFieldType.STREAM: {
      const stream = value as solace.SDTStreamContainer | null;
      const result: unknown[] = [];
      if (!stream) return result;
      stream.rewind();
      while (stream.hasNext()) {
        result.push(sdtFieldToJs(stream.getNext(), depth + 1));
      }
      stream.rewind();
      return result;
    }
    case solace.SDTFieldType.BYTEARRAY: {
      const bytes = toBytes(value);
      if (!bytes) return null;
      const decoded = decodeBytes(bytes);
      return decoded.encoding === "text" ? decoded.text : `base64:${decoded.text}`;
    }
    case solace.SDTFieldType.DESTINATION:
      return value ? destinationToString(value as solace.Destination) : null;
    case solace.SDTFieldType.NULLTYPE:
      return null;
    default:
      if (typeof value === "object" && value !== null) {
        // Long values and other objects
        return String(value);
      }
      return value;
  }
}

export function decodeUserProperties(message: solace.Message): UserPropertiesMap {
  const result: UserPropertiesMap = {};
  let map: solace.SDTMapContainer | null;
  try {
    map = message.getUserPropertyMap();
  } catch {
    return result;
  }
  if (!map) return result;
  for (const key of map.getKeys()) {
    try {
      const field = map.getField(key);
      result[key] = { type: field.getType(), value: sdtFieldToJs(field) };
    } catch (error) {
      result[key] = {
        type: solace.SDTFieldType.UNKNOWN,
        value: `<unreadable: ${(error as Error)?.message ?? error}>`,
      };
    }
  }
  return result;
}

/** Decodes the payload according to the message type (TEXT, MAP, STREAM or BINARY). */
export function decodePayload(message: solace.Message): {
  payload: string;
  payloadEncoding: "text" | "base64";
} {
  try {
    switch (message.getType()) {
      case solace.MessageType.TEXT: {
        const value = message.getSdtContainer()?.getValue();
        return { payload: typeof value === "string" ? value : String(value ?? ""), payloadEncoding: "text" };
      }
      case solace.MessageType.MAP:
      case solace.MessageType.STREAM:
        return {
          payload: JSON.stringify(sdtFieldToJs(message.getSdtContainer()), null, 2),
          payloadEncoding: "text",
        };
    }
  } catch {
    // Fall back to the raw attachment below.
  }
  const bytes = toBytes(message.getBinaryAttachment());
  if (bytes && bytes.length) {
    const decoded = decodeBytes(bytes);
    return { payload: decoded.text, payloadEncoding: decoded.encoding };
  }
  try {
    const xml = message.getXmlContentDecoded();
    if (xml) return { payload: xml, payloadEncoding: "text" };
  } catch {
    // No XML content
  }
  return { payload: "", payloadEncoding: "text" };
}

function safe<T>(read: () => T, fallback: T): T {
  try {
    const value = read();
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function buildMetadata(message: solace.Message): MessageMetadata {
  const replyTo = safe(() => message.getReplyTo(), null);
  const sequence = safe<unknown>(() => message.getSequenceNumber(), null);
  return {
    messageType: safe(() => message.getType(), undefined),
    deliveryMode: safe(() => message.getDeliveryMode(), solace.MessageDeliveryModeType.DIRECT),
    redelivered: safe(() => message.isRedelivered(), false),
    senderId: safe(() => message.getSenderId(), null),
    replyTo: replyTo ? replyTo.getName() : null,
    replyToType: replyTo ? replyTo.getType() : null,
    correlationId: safe(() => message.getCorrelationId(), null),
    applicationMessageId: safe(() => message.getApplicationMessageId(), null),
    applicationMessageType: safe(() => message.getApplicationMessageType(), null),
    httpContentType: safe(() => message.getHttpContentType(), null),
    httpContentEncoding: safe(() => message.getHttpContentEncoding(), null),
    sequenceNumber:
      typeof sequence === "number" ? sequence : sequence !== null ? Number(sequence) : null,
    deliveryCount: safe(() => message.getDeliveryCount() ?? null, null),
    rgmid: safe(() => message.getReplicationGroupMessageId()?.toString() ?? null, null),
    isDiscardIndication: safe(() => message.isDiscardIndication(), false),
    ttl: safe(() => message.getTimeToLive(), null),
    priority: safe(() => message.getPriority(), null),
    isDMQEligible: safe(() => message.isDMQEligible(), false),
    senderTimestamp: safe(() => message.getSenderTimestamp(), null),
    receiverTimestamp: safe(() => message.getReceiverTimestamp(), null) ?? Date.now(),
  };
}

export function createUid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Converts a received solclientjs message into the app's message model. Never throws. */
export function decodeMessage(message: solace.Message, source: MessageSource): Message {
  const destination = safe(() => message.getDestination(), null);
  const { payload, payloadEncoding } = decodePayload(message);
  return {
    _extension_uid: createUid(),
    topic: destination?.getName() ?? "unknown",
    destinationType: destination?.getType(),
    source,
    payload,
    payloadEncoding,
    userProperties: decodeUserProperties(message),
    metadata: buildMetadata(message),
  };
}

const INTEGER_TYPES = new Set<solace.SDTFieldType>([
  solace.SDTFieldType.INT8,
  solace.SDTFieldType.INT16,
  solace.SDTFieldType.INT32,
  solace.SDTFieldType.INT64,
  solace.SDTFieldType.UINT8,
  solace.SDTFieldType.UINT16,
  solace.SDTFieldType.UINT32,
  solace.SDTFieldType.UINT64,
]);

export function isIntegerType(type: solace.SDTFieldType) {
  return INTEGER_TYPES.has(type);
}

export function isFloatType(type: solace.SDTFieldType) {
  return type === solace.SDTFieldType.FLOATTYPE || type === solace.SDTFieldType.DOUBLETYPE;
}

/** Returns an error message for a user property value that cannot be sent as-is. */
export function validateUserPropertyValue(type: solace.SDTFieldType, value: unknown): string | null {
  if (isIntegerType(type)) {
    const n = typeof value === "string" ? Number(value) : (value as number);
    if (typeof n !== "number" || !Number.isInteger(n)) return "Enter a whole number.";
    if (n < MIN_INT64_PROPERTY || n > MAX_INT64_PROPERTY) {
      return "Integers must be between -2^47 and 2^48-1. Use a String property for larger values.";
    }
  } else if (isFloatType(type)) {
    const n = typeof value === "string" ? Number(value) : (value as number);
    if (typeof n !== "number" || !Number.isFinite(n)) return "Enter a number.";
  }
  return null;
}

function addUserProperties(message: solace.Message, userProperties: UserPropertiesMap) {
  const map = new solace.SDTMapContainer();
  for (const [key, { type, value }] of Object.entries(userProperties)) {
    const error = validateUserPropertyValue(type, value);
    if (error) throw new Error(`User property "${key}": ${error}`);
    if (isIntegerType(type)) {
      map.addField(key, solace.SDTFieldType.INT64, Number(value));
    } else if (isFloatType(type)) {
      // Older presets used FLOATTYPE (32-bit). JS numbers are doubles, so send DOUBLETYPE.
      map.addField(key, solace.SDTFieldType.DOUBLETYPE, Number(value));
    } else if (type === solace.SDTFieldType.BOOL) {
      map.addField(key, solace.SDTFieldType.BOOL, value === true || value === "true");
    } else {
      map.addField(key, solace.SDTFieldType.STRING, value === undefined || value === null ? "" : String(value));
    }
  }
  message.setUserPropertyMap(map);
}

const nonEmpty = (value: string | undefined | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Builds an outgoing message. Throws a readable Error for invalid input. */
export function buildOutgoingMessage(
  destination: string,
  content: string,
  options: PublishOptions = {}
): solace.Message {
  const name = destination.trim();
  if (!name) throw new Error("Enter a destination.");
  const message = SolclientFactory.createMessage();

  if (options.destinationType === solace.DestinationType.QUEUE) {
    message.setDestination(SolclientFactory.createDurableQueueDestination(name));
  } else {
    message.setDestination(SolclientFactory.createTopicDestination(name));
  }
  if (options.deliveryMode !== undefined) message.setDeliveryMode(options.deliveryMode);
  if (options.dmqEligible !== undefined) message.setDMQEligible(options.dmqEligible);
  if (options.priority !== undefined && Number.isFinite(options.priority)) {
    message.setPriority(Math.min(Math.max(Math.round(options.priority), 0), 255));
  }
  if (options.timeToLive !== undefined && Number.isFinite(options.timeToLive) && options.timeToLive > 0) {
    message.setTimeToLive(Math.round(options.timeToLive * 1000));
  }
  const replyTo = nonEmpty(options.replyToTopic);
  if (replyTo) message.setReplyTo(SolclientFactory.createTopicDestination(replyTo));
  const correlationId = nonEmpty(options.correlationId);
  if (correlationId) message.setCorrelationId(correlationId);
  const applicationMessageId = nonEmpty(options.applicationMessageId);
  if (applicationMessageId) message.setApplicationMessageId(applicationMessageId);
  const applicationMessageType = nonEmpty(options.applicationMessageType);
  if (applicationMessageType) message.setApplicationMessageType(applicationMessageType);

  if (options.messageType === solace.MessageType.BINARY) {
    // Encode as UTF-8; a JS string would be sent as latin1.
    message.setBinaryAttachment(utf8Encoder.encode(content));
  } else {
    // TEXT (also the default for presets saved without a message type).
    message.setSdtContainer(solace.SDTField.create(solace.SDTFieldType.STRING, content));
  }

  if (options.userProperties && Object.keys(options.userProperties).length) {
    addUserProperties(message, options.userProperties);
  }
  return message;
}

/** Recreates publish options from a received message, for "Copy to Publish" and "Resend". */
export function messageToPublishOptions(message: Message): PublishOptions & { content: string } {
  const isQueue = message.destinationType === solace.DestinationType.QUEUE;
  const userProperties: UserPropertiesMap = {};
  for (const [key, prop] of Object.entries(message.userProperties)) {
    if (isIntegerType(prop.type) && typeof prop.value === "number") {
      userProperties[key] = { type: solace.SDTFieldType.INT64, value: prop.value };
    } else if (isFloatType(prop.type) && typeof prop.value === "number") {
      userProperties[key] = { type: solace.SDTFieldType.DOUBLETYPE, value: prop.value };
    } else if (prop.type === solace.SDTFieldType.BOOL) {
      userProperties[key] = { type: solace.SDTFieldType.BOOL, value: prop.value === true };
    } else if (typeof prop.value === "string") {
      userProperties[key] = { type: solace.SDTFieldType.STRING, value: prop.value };
    }
  }
  const { metadata } = message;
  return {
    // Binary payloads that are not valid UTF-8 are copied as their base64 text.
    content: message.payload,
    destinationType: isQueue ? solace.DestinationType.QUEUE : solace.DestinationType.TOPIC,
    deliveryMode:
      metadata.deliveryMode === solace.MessageDeliveryModeType.DIRECT
        ? solace.MessageDeliveryModeType.DIRECT
        : solace.MessageDeliveryModeType.PERSISTENT,
    messageType:
      metadata.messageType === solace.MessageType.BINARY
        ? solace.MessageType.BINARY
        : solace.MessageType.TEXT,
    priority: metadata.priority ?? undefined,
    dmqEligible: metadata.isDMQEligible,
    timeToLive: metadata.ttl ? metadata.ttl / 1000 : undefined,
    replyToTopic:
      metadata.replyTo && metadata.replyToType === solace.DestinationType.TOPIC
        ? metadata.replyTo
        : undefined,
    correlationId: metadata.correlationId ?? undefined,
    applicationMessageId: metadata.applicationMessageId ?? undefined,
    applicationMessageType: metadata.applicationMessageType ?? undefined,
    userProperties,
  };
}

/** Removes whitespace outside of strings, to compare JSON texts. */
function minifyJson(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += text[++i] ?? "";
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (!/\s/.test(ch)) {
      out += ch;
    }
  }
  return out;
}

/**
 * Parses a JSON payload only when it round-trips exactly (no precision loss in big numbers,
 * no reformatted numbers, no duplicate keys). Otherwise returns undefined.
 */
export function parseJsonLossless(payload: string): unknown | undefined {
  const trimmed = payload.trim();
  if (!trimmed || !/^[[{]/.test(trimmed)) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed) === minifyJson(trimmed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** The message as written to an editor or export file. Internal fields are dropped. */
export function toExportable(message: Message) {
  const parsed = message.payloadEncoding === "base64" ? undefined : parseJsonLossless(message.payload);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _extension_uid, ...rest } = message;
  return {
    ...rest,
    payload: parsed !== undefined ? parsed : message.payload,
  };
}
