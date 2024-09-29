# Local Development

This extension is built using VSC webview and the Solace JavaScript API.

In order to run the extension locally, first you'd need to build the React.js view and then run the extension in VSC.

To build the React.js view, run the following commands:

```sh
npm run build:view
```

To run the extension in VSC in debug mode, open the [`extension.ts`](src/extension.ts) file and press `F5` (or use the debug menu in VSC).

To build the complete extension, run the following commands:

```sh
npm run build
```