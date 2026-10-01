import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { looksLikeZip, validateSaveZipRequest } from "./shared/messageArchive";

export interface SaveZipResult {
  saved: boolean;
  path?: string;
}

/**
 * Saves a ZIP archive built by the webview. The user picks the location in a save dialog,
 * which defaults to the active workspace folder.
 */
export async function saveZip(params: Record<string, unknown>, log: vscode.LogOutputChannel): Promise<SaveZipResult> {
  const { fileName, base64, count } = validateSaveZipRequest(params);
  const bytes = Buffer.from(base64, "base64");
  if (!looksLikeZip(bytes)) {
    throw new Error("The archive content is not a ZIP file.");
  }

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(defaultFolder(), fileName),
    filters: { "ZIP archive": ["zip"] },
    saveLabel: "Export",
    title: "Export messages as ZIP",
  });
  if (!uri) {
    return { saved: false };
  }

  await vscode.workspace.fs.writeFile(uri, bytes);
  const where = uri.scheme === "file" ? uri.fsPath : uri.toString(true);
  log.info(`Exported ${count ?? "the"} messages to ${where}`);

  const label = count === undefined ? "messages" : count === 1 ? "1 message" : `${count} messages`;
  // revealFileInOS only works for files on this machine.
  const canReveal = uri.scheme === "file" && !vscode.env.remoteName;
  // Not awaited: the notification can stay open long after the webview's request returns.
  vscode.window
    .showInformationMessage(`Exported ${label} to ${path.basename(uri.path)}.`, ...(canReveal ? ["Reveal"] : []))
    .then((choice) => {
      if (choice === "Reveal") {
        vscode.commands.executeCommand("revealFileInOS", uri);
      }
    });
  return { saved: true, path: where };
}

function defaultFolder(): vscode.Uri {
  const folders = vscode.workspace.workspaceFolders;
  if (folders?.length) {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    return ((activeUri && vscode.workspace.getWorkspaceFolder(activeUri)) || folders[0]).uri;
  }
  return vscode.Uri.file(os.homedir());
}
