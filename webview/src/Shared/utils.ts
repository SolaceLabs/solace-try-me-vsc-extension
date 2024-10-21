import { VSC_CONFIG_DEFAULT } from "./constants";
import { BrokerConfig, VscConfigInterface, VsCodeApi } from "./interfaces";
import solace from "solclientjs";

declare function acquireVsCodeApi(): VsCodeApi;

let runningInBrowser = false;

export const initializeVscConfig = () => {
  try {
    return acquireVsCodeApi();
  } catch {
    return (function () {
      // For browser testing
      console.info("Using mock vscode API");
      runningInBrowser = true;
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

export function openFileInNewTab(
  file: string,
  baseFilePath: string = "",
  id: string = Date.now().toString(),
  language = "json",
) {
  const data: {
    [key: string]: unknown;
  } = {
    command: "openInNewTab",
    content: file,
    language: language,
  };

  if (baseFilePath) {
    data["filePath"] = baseFilePath;
    data["fileName"] = `solace-try-me-${id}.${language}`;
  }
  vscode.postMessage(data);
}

export function getVscConfig() {
  if (runningInBrowser) {
    return Promise.resolve(vscode.getState() || VSC_CONFIG_DEFAULT);
  }
  return new Promise<VscConfigInterface>((resolve) => {
    const listener = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === "getPreferences/response") {
        window.removeEventListener("message", listener);
        if (!message.preferences) {
          resolve(VSC_CONFIG_DEFAULT);
        }
        resolve(message.preferences);
      }
    };
    window.addEventListener("message", listener);
    vscode.postMessage({ command: "getPreferences" });
  });
}

export async function setVscConfig(
  updateStateCB: (state: VscConfigInterface) => VscConfigInterface
) {
  const currentState = await getVscConfig();
  const newState = updateStateCB(currentState);
  if (runningInBrowser) {
    vscode.setState(newState);
  } else {
    vscode.postMessage({
      command: "savePreferences",
      preferences: newState,
    });
  }
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

export function formatDate(date: Date | number): string {
  if (typeof date === "number") {
    date = new Date(date);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}:${milliseconds}`;
}

export const convertTypeToString = (type: solace.SDTFieldType) => {
  switch (type) {
    case solace.SDTFieldType.BOOL:
      return "Boolean";
    case solace.SDTFieldType.INT8:
    case solace.SDTFieldType.INT16:
    case solace.SDTFieldType.INT32:
    case solace.SDTFieldType.INT64:
    case solace.SDTFieldType.UINT8:
    case solace.SDTFieldType.UINT16:
    case solace.SDTFieldType.UINT32:
    case solace.SDTFieldType.UINT64:
      return "Integer";
    case solace.SDTFieldType.WCHAR:
    case solace.SDTFieldType.STRING:
      return "String";
    case solace.SDTFieldType.FLOATTYPE:
    case solace.SDTFieldType.DOUBLETYPE:
      return "Float";
    default:
      return "Unknown";
  }
};
