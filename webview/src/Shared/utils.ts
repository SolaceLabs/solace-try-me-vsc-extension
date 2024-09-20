import { VSC_CONFIG_DEFAULT } from "./constants";
import { VscConfigInterface, VsCodeApi } from "./interfaces";


declare function acquireVsCodeApi(): VsCodeApi;

export const vscode = acquireVsCodeApi();

export function getVscConfig() {
  return vscode.getState() || VSC_CONFIG_DEFAULT;
}

export function setVscConfig(state: VscConfigInterface) {
  vscode.setState(state);
}