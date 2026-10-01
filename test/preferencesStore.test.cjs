// Upgrade and storage tests for the extension host preferences store.
// Runs against the compiled output: npm test (compiles first).
const { test } = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");
const path = require("node:path");

// Minimal stand-in for the parts of the vscode API the store uses.
class EventEmitter {
  constructor() {
    this.listeners = [];
    this.event = (listener) => {
      this.listeners.push(listener);
      return { dispose() {} };
    };
  }
  fire(value) {
    this.listeners.forEach((l) => l(value));
  }
  dispose() {}
}
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "vscode") return { EventEmitter };
  return originalLoad.call(this, request, ...rest);
};
const { PreferencesStore } = require(path.join(__dirname, "..", "out", "preferencesStore.js"));

const log = { info() {}, warn() {}, error() {} };

/** One activation of the extension: a VS Code session in a profile. */
function activate(ctx, sessionId = "session-1", secretNamespace = "profile-a") {
  return new PreferencesStore(ctx, log, { sessionId, secretNamespace });
}

const stored = (ctx) => ctx.state.get("preferences");

function makeContext(initial, { failSecrets = false, secretMap = new Map(), state } = {}) {
  state = state ?? new Map(initial === undefined ? [] : [["preferences", structuredClone(initial)]]);
  const guard = () => {
    if (failSecrets) throw new Error("no keychain");
  };
  return {
    state,
    secretMap,
    globalState: {
      get: (key) => state.get(key),
      update: async (key, value) => state.set(key, structuredClone(value)),
    },
    secrets: {
      get: async (key) => (guard(), secretMap.get(key)),
      store: async (key, value) => (guard(), secretMap.set(key, value)),
      delete: async (key) => (guard(), secretMap.delete(key)),
    },
  };
}

// What v0.0.12 stored under globalState "preferences".
const LEGACY = {
  settings: { maxDisplayMessages: 20, maxPayloadLength: 1024, maxPropertyLength: 128, brokerDisconnectTimeout: 1800000 },
  brokerConfigs: [
    { id: "default_localhost", title: "Default Localhost", url: "ws://localhost:8008", vpn: "default", username: "default", password: "default" },
    { id: "4821", title: "Cloud", url: "wss://mr-1.messaging.solace.cloud:443", vpn: "prod", username: "svc", password: "s3cret!" },
    { id: "777", title: "No password", url: "ws://host:8008", vpn: "v", username: "u", password: "" },
  ],
  recentlyUsed: {
    views: ["config", "subscribe"],
    subscribeConfig: [{ name: "orders", config: { topics: ["orders/>"], queueType: "QUEUE", queueName: "q1" } }],
    publishConfig: [{ name: "hello", config: { publishTo: "a/b", content: "hi", deliveryMode: 0, messageType: 3 } }],
  },
};

test("upgrading from v0.0.12 keeps profiles, presets and settings, and moves passwords to SecretStorage in two steps", async () => {
  const ctx = makeContext(LEGACY);
  const store = activate(ctx, "session-1");
  assert.deepStrictEqual(await store.whenReady(), { isFirstRun: false });

  const prefs = await store.get();
  assert.ok(!JSON.stringify(prefs).includes("s3cret"), "password sent to the webview");
  assert.ok(!JSON.stringify(prefs).includes("passwordMigrationSession"), "internal field sent to the webview");
  assert.deepStrictEqual(prefs.brokerConfigs.map((b) => b.id), ["default_localhost", "4821", "777"]);
  assert.deepStrictEqual(prefs.brokerConfigs.map((b) => b.hasPassword), [true, true, false]);
  assert.strictEqual(await store.getPassword("4821"), "s3cret!");
  assert.strictEqual(await store.getPassword("default_localhost"), "default");
  assert.deepStrictEqual(prefs.settings, LEGACY.settings);
  assert.deepStrictEqual(prefs.recentlyUsed.subscribeConfig, LEGACY.recentlyUsed.subscribeConfig);
  assert.deepStrictEqual(prefs.recentlyUsed.publishConfig, LEGACY.recentlyUsed.publishConfig);
  assert.deepStrictEqual(prefs.recentlyUsed.views, ["config", "subscribe"]);

  // Step 1: the secret is stored, and the plaintext stays until a later session.
  assert.strictEqual(ctx.secretMap.get("solaceTryMe.profile-a.broker.4821.password"), "s3cret!");
  assert.ok(JSON.stringify(stored(ctx)).includes("s3cret"));

  // Another window in the same session changes nothing.
  await activate(ctx, "session-1").whenReady();
  assert.ok(JSON.stringify(stored(ctx)).includes("s3cret"));

  // Step 2: after a restart the secret is read back, so the plaintext is removed.
  const restarted = activate(ctx, "session-2");
  await restarted.whenReady();
  assert.ok(!JSON.stringify(stored(ctx)).includes("s3cret"), "password left in globalState");
  assert.strictEqual(await restarted.getPassword("4821"), "s3cret!");
  assert.deepStrictEqual((await restarted.get()).brokerConfigs.map((b) => b.hasPassword), [true, true, false]);
});

test("an in-memory SecretStorage (no OS keyring) never loses migrated passwords", async () => {
  const state = new Map([["preferences", structuredClone(LEGACY)]]);
  await activate(makeContext(undefined, { state }), "session-1").whenReady();
  // Restart: the in-memory secrets are gone.
  const ctx = makeContext(undefined, { state, secretMap: new Map() });
  const store = activate(ctx, "session-2");
  await store.whenReady();
  assert.strictEqual(await store.getPassword("4821"), "s3cret!");
  assert.ok(JSON.stringify(stored(ctx)).includes("s3cret"), "plaintext removed without a working secret");
});

test("secrets of different VS Code profiles do not collide", async () => {
  const secretMap = new Map();
  const a = activate(makeContext(LEGACY, { secretMap }), "s", "profile-a");
  await a.whenReady();
  const b = activate(makeContext(undefined, { secretMap }), "s", "profile-b");
  await b.whenReady();
  assert.strictEqual(await b.getPassword("default_localhost"), "default");
  await b.update({ type: "deleteBroker", id: "4821" });
  assert.strictEqual(secretMap.get("solaceTryMe.profile-a.broker.4821.password"), "s3cret!");
});

test("without a keychain, legacy passwords stay where they are and keep working", async () => {
  const ctx = makeContext(LEGACY, { failSecrets: true });
  const store = activate(ctx);
  await store.whenReady();
  const prefs = await store.get();
  assert.ok(!JSON.stringify(prefs).includes("s3cret"), "password sent to the webview");
  assert.strictEqual(await store.getPassword("4821"), "s3cret!");

  await store.update({ type: "upsertBroker", broker: { ...prefs.brokerConfigs[1], title: "Renamed" } });
  assert.strictEqual(await store.getPassword("4821"), "s3cret!");
  assert.strictEqual((await store.get()).brokerConfigs[1].hasPassword, true);
});

test("editing, changing and deleting broker passwords", async () => {
  const ctx = makeContext(LEGACY);
  const store = activate(ctx);
  const prefs = await store.get();

  await store.update({ type: "upsertBroker", broker: { ...prefs.brokerConfigs[1], title: "Cloud 2" } });
  assert.strictEqual(await store.getPassword("4821"), "s3cret!", "edit without a new password must keep it");

  await store.update({ type: "upsertBroker", broker: prefs.brokerConfigs[1], password: "n3w" });
  assert.strictEqual(await store.getPassword("4821"), "n3w");
  assert.ok(!JSON.stringify(stored(ctx)).includes("s3cret"), "old plaintext kept after a new password");

  await store.update({ type: "upsertBroker", broker: { ...prefs.brokerConfigs[1], savePassword: false } });
  assert.strictEqual(await store.getPassword("4821"), undefined);
  assert.strictEqual((await store.get()).brokerConfigs[1].hasPassword, false);

  // Turning "Save password" back on (the webview omits default values) and resetting options.
  const { savePassword, sessionOptions, ...withDefaults } = (await store.get()).brokerConfigs[1];
  await store.update({ type: "upsertBroker", broker: withDefaults, password: "again" });
  const saved = (await store.get()).brokerConfigs[1];
  assert.strictEqual(saved.savePassword, undefined);
  assert.strictEqual(saved.hasPassword, true);
  assert.strictEqual(await store.getPassword("4821"), "again");
  await store.update({ type: "upsertBroker", broker: { ...saved, sessionOptions: { reapplySubscriptions: false } } });
  const { sessionOptions: _options, ...noOptions } = (await store.get()).brokerConfigs[1];
  await store.update({ type: "upsertBroker", broker: noOptions });
  assert.strictEqual((await store.get()).brokerConfigs[1].sessionOptions, undefined);

  await store.update({ type: "deleteBroker", id: "default_localhost" });
  assert.ok(!ctx.secretMap.has("solaceTryMe.profile-a.broker.default_localhost.password"));
});

test("a plaintext password written by an older version wins over the stored secret", async () => {
  const ctx = makeContext(LEGACY);
  const store = activate(ctx);
  await store.whenReady();
  const prefs = stored(ctx);
  prefs.brokerConfigs[1].password = "changed-in-old-window";
  ctx.state.set("preferences", prefs);
  assert.strictEqual(await store.getPassword("4821"), "changed-in-old-window");
});

test("a missing secret is reported as no saved password", async () => {
  const ctx = makeContext(LEGACY);
  await activate(ctx, "session-1").whenReady();
  await activate(ctx, "session-2").whenReady();
  ctx.secretMap.delete("solaceTryMe.profile-a.broker.4821.password");
  const store = activate(ctx, "session-3");
  await store.whenReady();
  assert.strictEqual((await store.get()).brokerConfigs[1].hasPassword, false);
});

test("concurrent changes from several views are all kept", async () => {
  const store = activate(makeContext(LEGACY));
  await Promise.all([
    store.update({ type: "upsertPreset", storeKey: "publishConfig", name: "p1", config: { publishTo: "x", content: "" } }),
    store.update({ type: "upsertPreset", storeKey: "publishConfig", name: "p2", config: { publishTo: "y", content: "" } }),
    store.update({ type: "setSettings", settings: { maxDisplayMessages: 50 } }),
    store.update({ type: "addRecentTopic", topic: "a/>" }),
  ]);
  const prefs = await store.get();
  assert.deepStrictEqual(prefs.recentlyUsed.publishConfig.map((p) => p.name).sort(), ["hello", "p1", "p2"]);
  assert.strictEqual(prefs.settings.maxDisplayMessages, 50);
  assert.strictEqual(prefs.settings.maxPayloadLength, 1024);
  assert.deepStrictEqual(prefs.recentlyUsed.recentTopics, ["a/>"]);
});

test("deleting the last preset is saved", async () => {
  const store = activate(makeContext(LEGACY));
  await store.update({ type: "deletePreset", storeKey: "subscribeConfig", name: "orders" });
  assert.deepStrictEqual((await store.get()).recentlyUsed.subscribeConfig, []);
});

test("first run seeds the default localhost broker", async () => {
  for (const initial of [undefined, ""]) {
    const store = activate(makeContext(initial));
    assert.deepStrictEqual(await store.whenReady(), { isFirstRun: true });
    assert.deepStrictEqual((await store.get()).brokerConfigs.map((b) => b.id), ["default_localhost"]);
    assert.strictEqual(await store.getPassword("default_localhost"), "default");
  }
});

test("profiles without authScheme round-trip unchanged, and client certificate profiles keep it", async () => {
  const ctx = makeContext(LEGACY);
  const store = activate(ctx, "session-1");
  const before = (await store.get()).brokerConfigs[1];
  assert.ok(!("authScheme" in before));
  await store.update({ type: "upsertBroker", broker: before });
  assert.deepStrictEqual((await store.get()).brokerConfigs[1], before);
  assert.strictEqual(await store.getPassword("4821"), "s3cret!");

  // A new client certificate profile: no username and no password.
  const cert = { id: "cc", title: "mTLS", url: "wss://broker:443", vpn: "prod", username: "", authScheme: "clientCertificate" };
  await store.update({ type: "upsertBroker", broker: cert });
  await store.update({ type: "upsertBroker", broker: { ...cert, title: "mTLS 2" } });
  let saved = (await store.get()).brokerConfigs.find((b) => b.id === "cc");
  assert.deepStrictEqual(saved, { ...cert, title: "mTLS 2", hasPassword: false });
  assert.strictEqual(await store.getPassword("cc"), undefined);

  // Switching a password profile to a client certificate removes its saved password (the webview sends clearPassword).
  await store.update({ type: "upsertBroker", broker: { ...before, authScheme: "clientCertificate" }, clearPassword: true });
  saved = (await store.get()).brokerConfigs[1];
  assert.strictEqual(saved.authScheme, "clientCertificate");
  assert.strictEqual(saved.hasPassword, false);
  assert.strictEqual(await store.getPassword("4821"), undefined);
  assert.ok(!JSON.stringify(stored(ctx)).includes("s3cret"), "password kept for a client certificate profile");

  // The scheme survives a restart, and switching back to basic (authScheme omitted) drops it.
  const restarted = activate(ctx, "session-2");
  assert.strictEqual((await restarted.get()).brokerConfigs.find((b) => b.id === "cc").authScheme, "clientCertificate");
  const { authScheme: _scheme, ...basic } = (await restarted.get()).brokerConfigs[1];
  await restarted.update({ type: "upsertBroker", broker: basic, password: "n3w" });
  saved = (await restarted.get()).brokerConfigs[1];
  assert.ok(!("authScheme" in saved));
  assert.strictEqual(await restarted.getPassword("4821"), "n3w");
});
