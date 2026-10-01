import solace from "solclientjs";

import { Message, MessageSource } from "../Shared/interfaces";
import { escapeRegExp, formatPropertyValue } from "../Shared/utils";

export type SearchScope = "all" | "topic" | "payload" | "userProperties";
export type DeliveryFilter = "direct" | "persistent" | "nonPersistent";
export type TypeFilter = "text" | "binary" | "map" | "stream";

export const SEARCH_SCOPES: { key: SearchScope; label: string }[] = [
  { key: "all", label: "All fields" },
  { key: "topic", label: "Topic" },
  { key: "payload", label: "Payload" },
  { key: "userProperties", label: "User properties" },
];
export const SOURCE_OPTIONS: { key: MessageSource; label: string }[] = [
  { key: "direct", label: "Direct" },
  { key: "queue", label: "Queue" },
  { key: "browse", label: "Browsed" },
  { key: "reply", label: "Reply" },
];
export const DELIVERY_OPTIONS: { key: DeliveryFilter; label: string }[] = [
  { key: "direct", label: "Direct" },
  { key: "persistent", label: "Persistent" },
  { key: "nonPersistent", label: "Non-Persistent" },
];
export const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: "text", label: "Text" },
  { key: "binary", label: "Binary" },
  { key: "map", label: "Map" },
  { key: "stream", label: "Stream" },
];

/** The message list filter, kept per view with usePersistentState. */
export interface MessageFilter {
  query: string;
  scope: SearchScope;
  caseSensitive: boolean;
  regex: boolean;
  /** Hide the messages that match the query instead of showing them. */
  invert: boolean;
  /** Empty: any source. Likewise for delivery modes and message types. */
  sources: MessageSource[];
  deliveryModes: DeliveryFilter[];
  messageTypes: TypeFilter[];
  redelivered: boolean;
  hasUserProperties: boolean;
  /** Exact destination name, set by "Filter to this topic". */
  topic: string | null;
  /** The quick filter chips are shown. Closed by default. */
  showChips: boolean;
}

export const DEFAULT_FILTER: MessageFilter = {
  query: "",
  scope: "all",
  caseSensitive: false,
  regex: false,
  invert: false,
  sources: [],
  deliveryModes: [],
  messageTypes: [],
  redelivered: false,
  hasUserProperties: false,
  topic: null,
  showChips: false,
};

const pick = <T extends string>(value: unknown, options: { key: T }[]): T[] =>
  Array.isArray(value) ? options.map((o) => o.key).filter((key) => value.includes(key)) : [];

/** Stored UI state is not trusted: fill in defaults and drop unknown values. */
export function normalizeFilter(value: unknown): MessageFilter {
  if (!value || typeof value !== "object") return DEFAULT_FILTER;
  const v = value as Partial<Record<keyof MessageFilter, unknown>>;
  const bool = (x: unknown, fallback: boolean) => (typeof x === "boolean" ? x : fallback);
  return {
    query: typeof v.query === "string" ? v.query : "",
    scope: SEARCH_SCOPES.some((s) => s.key === v.scope) ? (v.scope as SearchScope) : "all",
    caseSensitive: bool(v.caseSensitive, false),
    regex: bool(v.regex, false),
    invert: bool(v.invert, false),
    sources: pick(v.sources, SOURCE_OPTIONS),
    deliveryModes: pick(v.deliveryModes, DELIVERY_OPTIONS),
    messageTypes: pick(v.messageTypes, TYPE_OPTIONS),
    redelivered: bool(v.redelivered, false),
    hasUserProperties: bool(v.hasUserProperties, false),
    topic: typeof v.topic === "string" ? v.topic : null,
    showChips: bool(v.showChips, false),
  };
}

/** Number of quick filter chips that are on. */
export function countChips(filter: MessageFilter) {
  return (
    filter.sources.length +
    filter.deliveryModes.length +
    filter.messageTypes.length +
    (filter.redelivered ? 1 : 0) +
    (filter.hasUserProperties ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------
// Search text, computed once per message and field.
// ---------------------------------------------------------------------------

interface SearchFields {
  topic: string;
  payload: string;
  /** Keys and formatted values, matched one by one. */
  properties: string[];
}

const propertyCache = new WeakMap<Message, string[]>();
const lowerCache = new WeakMap<Message, SearchFields>();

const propertyText = (message: Message) => {
  let parts = propertyCache.get(message);
  if (parts === undefined) {
    parts = [];
    for (const [key, prop] of Object.entries(message.userProperties)) {
      parts.push(key, formatPropertyValue(prop.value));
    }
    propertyCache.set(message, parts);
  }
  return parts;
};

const rawFields = (message: Message): SearchFields => ({
  topic: message.topic,
  payload: message.payload,
  properties: propertyText(message),
});

const lowerFields = (message: Message): SearchFields => {
  let fields = lowerCache.get(message);
  if (fields === undefined) {
    fields = {
      topic: message.topic.toLowerCase(),
      payload: message.payload.toLowerCase(),
      properties: propertyText(message).map((part) => part.toLowerCase()),
    };
    lowerCache.set(message, fields);
  }
  return fields;
};

const deliveryKey = (mode: solace.MessageDeliveryModeType): DeliveryFilter =>
  mode === solace.MessageDeliveryModeType.PERSISTENT
    ? "persistent"
    : mode === solace.MessageDeliveryModeType.NON_PERSISTENT
    ? "nonPersistent"
    : "direct";

const TYPE_KEYS: Record<number, TypeFilter> = {
  [solace.MessageType.TEXT]: "text",
  [solace.MessageType.BINARY]: "binary",
  [solace.MessageType.MAP]: "map",
  [solace.MessageType.STREAM]: "stream",
};

// ---------------------------------------------------------------------------
// Compiled filter
// ---------------------------------------------------------------------------

/** What to mark in a message card. `pattern` is global; reset lastIndex before use. */
export interface Highlight {
  pattern: RegExp;
  topic: boolean;
  payload: boolean;
  userProperties: boolean;
}

export interface CompiledFilter {
  test: (message: Message) => boolean;
  /** Any constraint applies, so the list may be shorter than the buffer. */
  active: boolean;
  /** Invalid regular expression: the query is ignored until it is fixed. */
  error: string | null;
  highlight: Highlight | null;
}

export function compileFilter(filter: MessageFilter): CompiledFilter {
  const { query, scope, caseSensitive, regex, invert } = filter;
  let error: string | null = null;
  let matchText: ((text: string) => boolean) | null = null;
  let pattern: RegExp | null = null;
  const lower = !caseSensitive && !regex;

  if (query) {
    if (regex) {
      try {
        const re = new RegExp(query, caseSensitive ? "" : "i");
        pattern = new RegExp(query, caseSensitive ? "g" : "gi");
        matchText = (text) => re.test(text);
      } catch (e) {
        // Browsers already start the message with "Invalid regular expression".
        const message = (e as Error).message || "Invalid regular expression.";
        error = /^invalid regular expression/i.test(message) ? message : `Invalid regular expression: ${message}`;
      }
    } else {
      const needle = lower ? query.toLowerCase() : query;
      pattern = new RegExp(escapeRegExp(query), caseSensitive ? "g" : "gi");
      matchText = (text) => text.includes(needle);
    }
  }

  let matchQuery: ((message: Message) => boolean) | null = null;
  if (matchText) {
    const check = matchText;
    const fields = lower ? lowerFields : rawFields;
    matchQuery = (message) => {
      const f = fields(message);
      switch (scope) {
        case "topic":
          return check(f.topic);
        case "payload":
          return check(f.payload);
        case "userProperties":
          return f.properties.some(check);
        default:
          return check(f.topic) || check(f.payload) || f.properties.some(check);
      }
    };
  }

  const sources = filter.sources.length ? new Set<MessageSource>(filter.sources) : null;
  const deliveries = filter.deliveryModes.length ? new Set(filter.deliveryModes) : null;
  const types = filter.messageTypes.length ? new Set(filter.messageTypes) : null;
  const { topic, redelivered, hasUserProperties } = filter;

  const test = (message: Message) => {
    if (topic !== null && message.topic !== topic) return false;
    if (sources && !sources.has(message.source ?? "direct")) return false;
    if (deliveries && !deliveries.has(deliveryKey(message.metadata.deliveryMode))) return false;
    if (types) {
      const type = message.metadata.messageType;
      if (type === undefined || !types.has(TYPE_KEYS[type])) return false;
    }
    if (redelivered && !message.metadata.redelivered) return false;
    if (hasUserProperties && !propertyText(message).length) return false;
    return matchQuery ? matchQuery(message) !== invert : true;
  };

  return {
    test,
    active: !!matchQuery || topic !== null || countChips(filter) > 0,
    error,
    // Hidden matches are not shown, so there is nothing to mark.
    highlight:
      pattern && matchQuery && !invert
        ? {
            pattern,
            topic: scope === "all" || scope === "topic",
            payload: scope === "all" || scope === "payload",
            userProperties: scope === "all" || scope === "userProperties",
          }
        : null,
  };
}

const MAX_MARKS = 500;

/**
 * Splits content into plain and matching parts, or returns null when nothing matches.
 * Zero-length matches are skipped. The parts are rendered as text, never as HTML.
 */
export function splitHighlights(content: string, pattern: RegExp): { text: string; match: boolean }[] | null {
  const parts: { text: string; match: boolean }[] = [];
  let last = 0;
  let marks = 0;
  pattern.lastIndex = 0;
  let found: RegExpExecArray | null;
  while (marks < MAX_MARKS && (found = pattern.exec(content)) !== null) {
    if (!found[0]) {
      pattern.lastIndex++;
      continue;
    }
    if (found.index > last) parts.push({ text: content.slice(last, found.index), match: false });
    parts.push({ text: found[0], match: true });
    last = found.index + found[0].length;
    marks++;
  }
  pattern.lastIndex = 0;
  if (!marks) return null;
  if (last < content.length) parts.push({ text: content.slice(last), match: false });
  return parts;
}
