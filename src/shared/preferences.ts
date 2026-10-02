/**
 * Stored preference model and the operations that change it.
 *
 * Shared by the extension host (the single source of truth, backed by globalState) and the
 * webview's browser mock. It must stay free of imports so both the Node and the Vite builds
 * can compile it.
 *
 * Backward compatibility: the stored shape is the one older versions wrote under the
 * "preferences" key. New fields are optional, and missing structure is filled in on read.
 */

export interface StoredBroker {
  id: string;
  title: string;
  url: string;
  vpn: string;
  username: string;
  /** Only present in profiles written by versions before SecretStorage was used. */
  password?: string;
  hasPassword?: boolean;
  /**
   * Session in which a legacy plaintext password was copied to SecretStorage. The plaintext
   * is only removed in a later session, once the secret has been read back: SecretStorage
   * can be in-memory only (e.g. Linux without a keyring) and would lose it on restart.
   */
  passwordMigrationSession?: string;
  savePassword?: boolean;
  /** "clientCertificate", or absent for username and password. */
  authScheme?: string;
  sessionOptions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StoredPreset {
  name: string;
  config: Record<string, unknown>;
}

export interface StoredHistoryEntry {
  id: string;
  [key: string]: unknown;
}

export interface StoredPreferences {
  brokerConfigs: StoredBroker[];
  settings: Record<string, unknown>;
  recentlyUsed: {
    views: string[];
    subscribeConfig: StoredPreset[];
    publishConfig: StoredPreset[];
    recentTopics: string[];
    publishHistory: StoredHistoryEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type PresetStoreKey = "subscribeConfig" | "publishConfig";

export type PreferencesOp =
  | { type: "setSettings"; settings: Record<string, unknown> }
  | {
      type: "upsertBroker";
      broker: StoredBroker;
      /** New password to save. Omit to keep the saved one. */
      password?: string;
      /** Remove the saved password. */
      clearPassword?: boolean;
    }
  | { type: "deleteBroker"; id: string }
  | {
      type: "upsertPreset";
      storeKey: PresetStoreKey;
      name: string;
      config: Record<string, unknown>;
    }
  | { type: "deletePreset"; storeKey: PresetStoreKey; name: string }
  | { type: "setViews"; views: string[] }
  | { type: "addRecentTopic"; topic: string }
  | { type: "addPublishHistory"; entry: StoredHistoryEntry }
  | {
      type: "updatePublishHistory";
      id: string;
      patch: Record<string, unknown>;
    }
  | { type: "clearPublishHistory" };

export const MAX_RECENT_TOPICS = 20;
export const MAX_PUBLISH_HISTORY = 50;

export const DEFAULT_LOCALHOST_BROKER: StoredBroker = {
  id: "default_localhost",
  title: "Default Localhost",
  url: "ws://localhost:8008",
  vpn: "default",
  username: "default",
};
export const DEFAULT_LOCALHOST_PASSWORD = "default";

/**
 * SecretStorage is shared by all VS Code profiles while globalState is per profile, so keys
 * carry a per-profile namespace.
 */
export function brokerSecretKey(namespace: string, brokerId: string) {
  return `solaceTryMe.${namespace}.broker.${brokerId}.password`;
}

/** Fields of a stored broker that only the host manages. */
const HOST_MANAGED_BROKER_FIELDS = ["password", "hasPassword", "passwordMigrationSession"] as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBroker = (value: unknown): value is StoredBroker =>
  isObject(value) && typeof value.id === "string" && value.id.length > 0;

const isPreset = (value: unknown): value is StoredPreset =>
  isObject(value) && typeof value.name === "string" && isObject(value.config);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * Returns a complete preferences object. Values that are present are kept as they are,
 * so data written by older versions survives; only missing or malformed structure is
 * replaced. `undefined` (nothing stored yet) seeds the default localhost broker.
 */
export function normalizeStoredPreferences(raw: unknown): StoredPreferences {
  const firstRun = raw === undefined || raw === null || raw === "";
  const prefs = isObject(raw) ? clone(raw) : {};
  const recentlyUsed = isObject(prefs.recentlyUsed) ? prefs.recentlyUsed : {};

  let brokerConfigs: StoredBroker[];
  if (Array.isArray(prefs.brokerConfigs)) {
    brokerConfigs = prefs.brokerConfigs.filter(isBroker);
  } else {
    brokerConfigs = firstRun ? [clone(DEFAULT_LOCALHOST_BROKER)] : [];
  }

  return {
    ...prefs,
    brokerConfigs,
    settings: isObject(prefs.settings) ? prefs.settings : {},
    recentlyUsed: {
      ...recentlyUsed,
      views: Array.isArray(recentlyUsed.views)
        ? recentlyUsed.views.filter((v): v is string => typeof v === "string")
        : ["config"],
      subscribeConfig: Array.isArray(recentlyUsed.subscribeConfig)
        ? recentlyUsed.subscribeConfig.filter(isPreset)
        : [],
      publishConfig: Array.isArray(recentlyUsed.publishConfig)
        ? recentlyUsed.publishConfig.filter(isPreset)
        : [],
      recentTopics: Array.isArray(recentlyUsed.recentTopics)
        ? recentlyUsed.recentTopics.filter(
            (t): t is string => typeof t === "string"
          )
        : [],
      publishHistory: Array.isArray(recentlyUsed.publishHistory)
        ? recentlyUsed.publishHistory.filter(
            (e): e is StoredHistoryEntry =>
              isObject(e) && typeof e.id === "string"
          )
        : [],
    },
  };
}

/** Removes plaintext passwords before preferences are sent to a webview. */
export function withoutSecrets(prefs: StoredPreferences): StoredPreferences {
  const copy = clone(prefs);
  for (const broker of copy.brokerConfigs) {
    if (typeof broker.password === "string") {
      broker.hasPassword = broker.hasPassword || broker.password.length > 0;
      delete broker.password;
    }
    delete broker.passwordMigrationSession;
  }
  return copy;
}

/**
 * Applies one change to a fresh copy of the stored preferences. Every webview sends small
 * operations instead of whole sections, so concurrent edits from other views are not lost.
 * Passwords are handled by the caller and never written here.
 */
export function applyPreferencesOp(
  current: StoredPreferences,
  op: PreferencesOp
): StoredPreferences {
  const next = normalizeStoredPreferences(current);
  const recent = next.recentlyUsed;

  switch (op.type) {
    case "setSettings":
      next.settings = { ...next.settings, ...clone(op.settings) };
      break;
    case "upsertBroker": {
      const broker = clone(op.broker);
      delete broker.password;
      delete broker.passwordMigrationSession;
      const index = next.brokerConfigs.findIndex((b) => b.id === broker.id);
      if (index >= 0) {
        // Replace the profile (fields reset to their default are simply absent), but keep the
        // host-managed password fields. The host drops a legacy password once a secret replaces it.
        const existing = next.brokerConfigs[index];
        const kept: Partial<StoredBroker> = {};
        for (const field of HOST_MANAGED_BROKER_FIELDS) {
          if (existing[field] !== undefined) {
            (kept as Record<string, unknown>)[field] = existing[field];
          }
        }
        next.brokerConfigs[index] = { ...kept, ...broker } as StoredBroker;
      } else {
        next.brokerConfigs.push(broker);
      }
      break;
    }
    case "deleteBroker":
      next.brokerConfigs = next.brokerConfigs.filter((b) => b.id !== op.id);
      break;
    case "upsertPreset": {
      const list = recent[op.storeKey];
      const existing = list.find((p) => p.name === op.name);
      if (existing) {
        existing.config = clone(op.config);
      } else {
        list.unshift({ name: op.name, config: clone(op.config) });
      }
      break;
    }
    case "deletePreset":
      recent[op.storeKey] = recent[op.storeKey].filter(
        (p) => p.name !== op.name
      );
      break;
    case "setViews":
      recent.views = [...op.views];
      break;
    case "addRecentTopic": {
      const topic = op.topic.trim();
      if (topic) {
        recent.recentTopics = [
          topic,
          ...recent.recentTopics.filter((t) => t !== topic),
        ].slice(0, MAX_RECENT_TOPICS);
      }
      break;
    }
    case "addPublishHistory":
      recent.publishHistory = [
        clone(op.entry),
        ...recent.publishHistory.filter((e) => e.id !== op.entry.id),
      ].slice(0, MAX_PUBLISH_HISTORY);
      break;
    case "updatePublishHistory":
      recent.publishHistory = recent.publishHistory.map((e) =>
        e.id === op.id ? { ...e, ...clone(op.patch) } : e
      );
      break;
    case "clearPublishHistory":
      recent.publishHistory = [];
      break;
  }
  return next;
}
