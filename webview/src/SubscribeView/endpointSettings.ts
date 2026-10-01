import solace from "solclientjs";
import { QueueBindMode } from "../Shared/interfaces";

export interface EndpointSettings {
  open: boolean;
  type: solace.QueueType;
  mode: QueueBindMode;
  name: string;
  topic: string;
  createIfMissing: boolean;
  temporary: boolean;
  /** Topic subscriptions added to a temporary queue. */
  subscriptions: string[];
}

export const DEFAULT_ENDPOINT_SETTINGS: EndpointSettings = {
  open: false,
  type: solace.QueueType.QUEUE,
  mode: "consume",
  name: "",
  topic: "",
  createIfMissing: false,
  temporary: false,
  subscriptions: [],
};
