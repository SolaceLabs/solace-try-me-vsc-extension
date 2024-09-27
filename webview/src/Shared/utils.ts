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
      const data = { state: VSC_CONFIG_DEFAULT };
      const vscSimulator: VsCodeApi = {
        getState: () => data.state,
        setState: (state: VscConfigInterface) => {
          data.state = state;
        },
      };
      return vscSimulator;
    })();
  }
};

export const vscode = initializeVscConfig();

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
