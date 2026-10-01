import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  json: "json",
  xml: "xml",
  plaintext: "txt",
};

export interface OpenContentRequest {
  content: string;
  language?: string;
  /** Used to build the file name when payloads are saved to disk. */
  id?: string;
  /** Always open an untitled document, even when saving payloads is enabled. */
  untitled?: boolean;
}

interface FileSettings {
  savePayloads?: unknown;
  payloadBasePath?: unknown;
}

/**
 * Opens message content in an editor. The save location comes from the stored settings,
 * never from the webview message, and existing files are never overwritten.
 */
export async function openContent(
  request: OpenContentRequest,
  settings: FileSettings,
  log: vscode.LogOutputChannel
) {
  const language =
    typeof request.language === "string" && request.language in LANGUAGE_EXTENSIONS
      ? request.language
      : "plaintext";
  const content = typeof request.content === "string" ? request.content : "";

  if (request.untitled || settings.savePayloads !== true) {
    const document = await vscode.workspace.openTextDocument({ content, language });
    await vscode.window.showTextDocument(document, { preview: true });
    return;
  }

  const base = resolveBaseUri(
    typeof settings.payloadBasePath === "string" ? settings.payloadBasePath : ""
  );
  if (!base) {
    vscode.window.showWarningMessage(
      "Solace Try Me: the payload directory is relative but no folder is open, so the message was opened in an unsaved editor. Open a folder or set an absolute path in the extension settings."
    );
    const document = await vscode.workspace.openTextDocument({ content, language });
    await vscode.window.showTextDocument(document, { preview: true });
    return;
  }

  const safeId =
    (typeof request.id === "string" ? request.id : "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) ||
    Date.now().toString();
  const extension = LANGUAGE_EXTENSIONS[language];
  const uri = await uniqueFileUri(base, `solace-try-me-${safeId}`, extension);

  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
  log.info(`Saved message to ${uri.toString(true)}`);
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: true });
}

function resolveBaseUri(configuredPath: string): vscode.Uri | undefined {
  let basePath = configuredPath.trim() || "./.solace-try-me";
  if (basePath === "~" || basePath.startsWith("~/") || basePath.startsWith("~\\")) {
    basePath = path.join(os.homedir(), basePath.slice(1));
  }
  if (path.isAbsolute(basePath)) {
    return vscode.Uri.file(basePath);
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return undefined;
  }
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const folder = (activeUri && vscode.workspace.getWorkspaceFolder(activeUri)) || folders[0];
  // joinPath keeps the folder's scheme, so remote and virtual workspaces work.
  return vscode.Uri.joinPath(folder.uri, ...basePath.split(/[\\/]+/).filter(Boolean));
}

async function uniqueFileUri(base: vscode.Uri, name: string, extension: string) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const suffix = attempt ? `-${attempt}` : "";
    const candidate = vscode.Uri.joinPath(base, `${name}${suffix}.${extension}`);
    try {
      await vscode.workspace.fs.stat(candidate);
    } catch {
      return candidate;
    }
  }
  return vscode.Uri.joinPath(base, `${name}-${Date.now()}.${extension}`);
}
