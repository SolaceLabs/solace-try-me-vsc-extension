import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // Register the webview view provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "solaceTryMeVscExtension.config",
      new SolaceTryMeViewProvider(context, "config-panel")
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "solaceTryMeVscExtension.subscribe",
      new SolaceTryMeViewProvider(context, "subscribe-panel")
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "solaceTryMeVscExtension.publish",
      new SolaceTryMeViewProvider(context, "publish-panel")
    )
  );
}

class SolaceTryMeViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly viewType: string
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    const { webview } = webviewView;

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

    const jsUri =  vscode.Uri.joinPath(uriPrefix, "assets", "index.js");
    const cssUri = vscode.Uri.joinPath(uriPrefix, "assets", "index.css");

    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Solace TryMe VSC Extension View</title>
        <script type="module" crossorigin src="${jsUri}"></script>
        <link rel="stylesheet" crossorigin href="${cssUri}">
      </head>
      <body class="dark">
        <div id="${this.viewType}"></div>
      </body>
    </html>
`;
  }
}

export function deactivate() {}
