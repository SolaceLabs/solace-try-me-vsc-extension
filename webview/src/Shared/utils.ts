import { VSC_CONFIG_DEFAULT } from "./constants";
import { BrokerConfig, VscConfigInterface, VsCodeApi } from "./interfaces";

declare function acquireVsCodeApi(): VsCodeApi;

export const initializeVscConfig = () => {
  try {
    return acquireVsCodeApi();
  } catch {
    return (function () {
      // For browser testing
      console.info("Using mock vscode API");
      const lsKey = "vscConfig";
      const vscSimulator: VsCodeApi = {
        getState: () =>
          localStorage.getItem(lsKey)
            ? JSON.parse(localStorage.getItem(lsKey) as string)
            : VSC_CONFIG_DEFAULT,
        setState: (state: VscConfigInterface) => {
          localStorage.setItem(lsKey, JSON.stringify(state));
        },
        postMessage: (message: { [key: string]: unknown }) => {
          console.log("Message from webview", message);
        },
      };
      return vscSimulator;
    })();
  }
};

export const vscode = initializeVscConfig();

export function openFileInNewTab(file: string, language = "json") {
  vscode.postMessage({
    command: "openInNewTab",
    content: file,
    language: language,
  });
}

export function getVscConfig() {
  return vscode.getState() || VSC_CONFIG_DEFAULT;
}

export function setVscConfig(
  updateStateCB: (state: VscConfigInterface) => VscConfigInterface
) {
  const currentState = getVscConfig();
  const newState = updateStateCB(currentState);
  vscode.setState(newState);
}

export function compareBrokerConfigs(a: BrokerConfig, b: BrokerConfig) {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.url === b.url &&
    a.vpn === b.vpn &&
    a.username === b.username &&
    a.password === b.password
  );
}

export const deepCompareObjects = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (
      !keysB.includes(key) ||
      !deepCompareObjects(
        (a as { [x: string]: unknown })[key],
        (b as { [x: string]: unknown })[key]
      )
    ) {
      return false;
    }
  }
  return true;
};
