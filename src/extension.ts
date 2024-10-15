import * as vscode from "vscode";

const openTabs = new Set();

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

  // Register solaceTryMeVscExtension.newWindow command to open the webview in a new window
  context.subscriptions.push(
    vscode.commands.registerCommand("solaceTryMeVscExtension.newWindow", () => {
      let tabNumber = 1;
      while (openTabs.has(tabNumber)) {
        tabNumber++;
      }
      openTabs.add(tabNumber);

      const panel = vscode.window.createWebviewPanel(
        "solaceTryMeVscExtension.newWindow",
        `Solace Try Me - Tab ${tabNumber}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );
      const provider = new SolaceTryMeViewProvider(context);
      provider.resolveWebviewView(panel);
      panel.onDidDispose(() => {
        openTabs.delete(tabNumber);
      });
    })
  );
}

class SolaceTryMeViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView| vscode.WebviewPanel) {
    const { webview } = webviewView;

    webview.onDidReceiveMessage(async (message) => {
      if (message.command === "openInNewTab") {
        const document = await vscode.workspace.openTextDocument({
          content: message.content,
          language: message.language ?? "plaintext",
        });
        vscode.window.showTextDocument(document, { preview: true });
      } else if (message.command === "savePreferences") {
        this.context.globalState.update("preferences", message.preferences);
      } else if (message.command === "getPreferences") {
        webview.postMessage({
          command: "getPreferences/response",
          preferences: this.context.globalState.get("preferences", ""),
        });
      }
    });

    // Allow scripts in the webview
    webview.options = {
      enableScripts: true,
    };

    // Set the HTML content for the webview
    webview.html = this.getHtmlForWebview(webview);

    // Send the current theme to the webview
    this.updateTheme(webview);

    // Listen for theme changes and update the webview accordingly
    vscode.window.onDidChangeActiveColorTheme((event) => {
      this.updateTheme(webview);
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const uriPrefix = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "webview-dist")
    );

    const jsUri = vscode.Uri.joinPath(uriPrefix, "assets", "index.js");
    const cssUri = vscode.Uri.joinPath(uriPrefix, "assets", "index.css");

    const theme = this.getTheme();

    return `
    <!DOCTYPE html>
    <html lang="en" class="${theme}">
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

  private getTheme() {
    // Using dark for high contrast and dark themes
    return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light
      ? "light"
      : "dark";
  }

  // Method to send the current theme to the webview
  private updateTheme(webview: vscode.Webview) {
    const theme = this.getTheme();
    // Send a message to the webview to update the theme
    webview.postMessage({ command: "setTheme", theme });
  }
}

export function deactivate() {}
