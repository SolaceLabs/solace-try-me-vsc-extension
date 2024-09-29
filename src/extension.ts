import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // Register the webview view provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "solaceTryMeVscExtension.sideView",
      new SolaceTryMeViewProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );
}

class SolaceTryMeViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    const { webview } = webviewView;

    webview.onDidReceiveMessage(async (message) => {
      if (message.command === "openInNewTab") {
        const document = await vscode.workspace.openTextDocument({
          content: message.content,
          language: message.language ?? "plaintext",
        });
        vscode.window.showTextDocument(document, { preview: true });
      }
    });

    // Allow scripts in the webview
    webview.options = {
      enableScripts: true,
    };

    // Set the HTML content for the webview
    webview.html = this.getHtmlForWebview(webview);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const uriPrefix = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "webview-dist")
    );

    const jsUri = vscode.Uri.joinPath(uriPrefix, "assets", "index.js");
    const cssUri = vscode.Uri.joinPath(uriPrefix, "assets", "index.css");

    return `
    <!DOCTYPE html>
    <html lang="en" class="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Solace TryMe VSC Extension View</title>
        <script type="module" crossorigin src="${jsUri}"></script>
        <link rel="stylesheet" crossorigin href="${cssUri}">
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>
`;
  }
}

export function deactivate() {}
