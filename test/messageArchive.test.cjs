// Tests for the "Export as ZIP" names, request validation and the host's file/saveZip handler.
// Runs against the compiled output: npm test (compiles first).
const { test } = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");
const path = require("node:path");

// Minimal stand-in for the parts of the vscode API that saveZip uses.
const vscodeMock = {
  saveDialogResult: undefined,
  written: [],
  infoMessages: [],
  dialogOptions: undefined,
  workspaceFolders: [{ uri: { scheme: "file", path: "/work/project", fsPath: "/work/project" } }],
};
const joinPath = (base, ...parts) => {
  const p = [base.path, ...parts].join("/");
  return { scheme: base.scheme, path: p, fsPath: p };
};
const vscode = {
  Uri: { joinPath, file: (p) => ({ scheme: "file", path: p, fsPath: p }) },
  env: { remoteName: undefined },
  window: {
    activeTextEditor: undefined,
    showSaveDialog: async (options) => {
      vscodeMock.dialogOptions = options;
      return vscodeMock.saveDialogResult;
    },
    showInformationMessage: async (...args) => {
      vscodeMock.infoMessages.push(args);
      return undefined;
    },
  },
  workspace: {
    get workspaceFolders() {
      return vscodeMock.workspaceFolders;
    },
    getWorkspaceFolder: () => undefined,
    fs: {
      writeFile: async (uri, bytes) => vscodeMock.written.push({ uri, bytes }),
    },
  },
  commands: { executeCommand: async () => undefined },
};
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "vscode") return vscode;
  return originalLoad.call(this, request, ...rest);
};

const out = path.join(__dirname, "..", "out");
const archive = require(path.join(out, "shared", "messageArchive.js"));
const { saveZip } = require(path.join(out, "fileSave.js"));

const log = { info() {}, warn() {}, error() {} };
// An empty ZIP archive: just the end of central directory record.
const EMPTY_ZIP = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);

test("entry names: zero-padded index, sanitized topic and receive time", () => {
  const time = Date.UTC(2026, 9, 1, 14, 17, 28, 124);
  assert.strictEqual(archive.archiveEntryName(0, 4, "orders/created", time), "0001_orders-created_2026-10-01T14-17-28-124Z.json");
  assert.strictEqual(archive.archiveEntryName(41, 5, "a/*/b c>", time), "00042_a-b-c_2026-10-01T14-17-28-124Z.json");
  assert.strictEqual(archive.archiveEntryName(0, 4, "../../etc/passwd", time), "0001_etc-passwd_2026-10-01T14-17-28-124Z.json");
  assert.strictEqual(archive.archiveEntryName(0, 4, "///", time), "0001_message_2026-10-01T14-17-28-124Z.json");
  assert.strictEqual(archive.archiveEntryName(0, 4, "t", Number.NaN), "0001_t_unknown-time.json");
  assert.ok(archive.sanitizeFileNamePart("x".repeat(500)).length <= 80);
});

test("entry names are unique, ignoring case", () => {
  const used = new Set();
  assert.strictEqual(archive.uniqueEntryName("a.json", used), "a.json");
  assert.strictEqual(archive.uniqueEntryName("A.json", used), "A-2.json");
  assert.strictEqual(archive.uniqueEntryName("a.json", used), "a-3.json");
});

test("default archive name", () => {
  assert.strictEqual(
    archive.defaultArchiveName(Date.UTC(2026, 9, 1, 14, 17, 28, 124)),
    "solace-try-me-messages-2026-10-01T14-17-28-124Z.zip"
  );
});

test("validateSaveZipRequest rejects bad input", () => {
  const base64 = EMPTY_ZIP.toString("base64");
  assert.deepStrictEqual(archive.validateSaveZipRequest({ fileName: "a.zip", base64, count: 3 }), {
    fileName: "a.zip",
    base64,
    count: 3,
  });
  assert.strictEqual(archive.validateSaveZipRequest({ fileName: "a.ZIP", base64, count: -1 }).count, undefined);
  for (const fileName of [undefined, "", "a.json", "../a.zip", "a/b.zip", "a\\b.zip", ".zip", "a\n.zip", `${"a".repeat(300)}.zip`]) {
    assert.throws(() => archive.validateSaveZipRequest({ fileName, base64 }), /file name/, String(fileName));
  }
  assert.throws(() => archive.validateSaveZipRequest({ fileName: "a.zip", base64: 42 }), /missing/);
  assert.throws(() => archive.validateSaveZipRequest({ fileName: "a.zip", base64: "abc" }), /base64/);
  assert.throws(() => archive.validateSaveZipRequest({ fileName: "a.zip", base64: "ab!=" }), /base64/);
  assert.throws(
    () => archive.validateSaveZipRequest({ fileName: "a.zip", base64: "A".repeat(archive.MAX_ZIP_BASE64_LENGTH + 4) }),
    /larger than/
  );
});

test("saveZip writes the archive where the user chose", async () => {
  vscodeMock.written = [];
  vscodeMock.infoMessages = [];
  vscodeMock.saveDialogResult = { scheme: "file", path: "/work/out.zip", fsPath: "/work/out.zip" };
  const result = await saveZip({ fileName: "m.zip", base64: EMPTY_ZIP.toString("base64"), count: 2 }, log);
  assert.deepStrictEqual(result, { saved: true, path: "/work/out.zip" });
  assert.strictEqual(vscodeMock.dialogOptions.defaultUri.path, "/work/project/m.zip");
  assert.strictEqual(vscodeMock.written.length, 1);
  assert.ok(Buffer.from(vscodeMock.written[0].bytes).equals(EMPTY_ZIP));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(vscodeMock.infoMessages[0], ["Exported 2 messages to out.zip.", "Reveal"]);
});

test("saveZip: cancelled dialog writes nothing", async () => {
  vscodeMock.written = [];
  vscodeMock.saveDialogResult = undefined;
  const result = await saveZip({ fileName: "m.zip", base64: EMPTY_ZIP.toString("base64") }, log);
  assert.deepStrictEqual(result, { saved: false });
  assert.strictEqual(vscodeMock.written.length, 0);
});

test("saveZip rejects content that is not a ZIP, before asking", async () => {
  vscodeMock.dialogOptions = undefined;
  await assert.rejects(
    saveZip({ fileName: "m.zip", base64: Buffer.from("hello world!").toString("base64") }, log),
    /not a ZIP/
  );
  assert.strictEqual(vscodeMock.dialogOptions, undefined);
});
