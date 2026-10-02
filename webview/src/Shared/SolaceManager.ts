import solace, { SolclientFactory } from "solclientjs";
import {
  BrokerConfig,
  ConnectionRole,
  Message,
  PublishOptions,
  QueueBindMode,
} from "./interfaces";
import { buildOutgoingMessage, createUid, decodeMessage } from "./messageCodec";
import { connectionHint, describeError } from "./errors";
import { solaceTopicToRegExp } from "./topics";
import { createLogger, Logger } from "./logger";
import { DEFAULT_LOCALHOST_BROKER_ID } from "./constants";

// One-time SDK setup. solclientjs logs go to the "Solace Try Me" output channel.
const sdkLog = createLogger("solclientjs");
const formatSdkArgs = (args: unknown[]) =>
  args.map((a) => (typeof a === "string" ? a : describeError(a))).join(" ");
const factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10_5;
factoryProps.logLevel = solace.LogLevel.WARN;
type SdkLogFn = typeof solace.LogImpl.loggingCallback;
factoryProps.logger = new solace.LogImpl(
  (() => {}) as SdkLogFn,
  (() => {}) as SdkLogFn,
  ((...args: unknown[]) => sdkLog.info(formatSdkArgs(args))) as SdkLogFn,
  ((...args: unknown[]) => sdkLog.warn(formatSdkArgs(args))) as SdkLogFn,
  ((...args: unknown[]) => sdkLog.error(formatSdkArgs(args))) as SdkLogFn,
  ((...args: unknown[]) => sdkLog.error(formatSdkArgs(args))) as SdkLogFn
);
SolclientFactory.init(factoryProps);

export const SOLCLIENT_VERSION = solace.Version?.version ?? "unknown";

export enum ConnectionStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RECONNECTING = "reconnecting",
}

export type DisconnectReason = "user" | "inactivity" | "failed" | "down";

export interface ConnectionState {
  status: ConnectionStatus;
  reason?: DisconnectReason;
  error?: string;
  hint?: string;
}

export interface PublishResult {
  id: string;
  ok: boolean;
  error?: string;
}

export interface ConnectParams {
  broker: BrokerConfig;
  password: string;
  /** The broker URL, already resolved for remote windows. */
  url: string;
  remoteName?: string | null;
}

export interface ConnectionInfo {
  clientName?: string;
  brokerVersion?: string;
  routerName?: string;
  platform?: string;
  maxDirectMessageSize?: number;
  maxGuaranteedMessageSize?: number;
  capabilities: Record<string, boolean>;
  stats: Record<string, number>;
}

export type BindingState = "binding" | "active" | "standby" | "reconnecting" | "down";

export interface BindingStatus {
  state: BindingState;
  endpointName?: string;
  error?: string;
}

export interface BindOptions {
  mode: QueueBindMode;
  type: solace.QueueType;
  /** Endpoint name. Ignored for temporary queues. */
  name?: string;
  /** Topic Endpoint subscription. */
  topic?: string;
  createIfMissing?: boolean;
  temporary?: boolean;
}

const SUBSCRIPTION_TIMEOUT = 10000;
const MAX_TIMEOUT = 2_147_483_647; // setTimeout limit
const MAX_BROWSED_MESSAGES = 2000;

/**
 * Why a subscription change did not complete:
 * - "rejected": the broker refused it (or the topic is invalid)
 * - "timeout": no confirmation arrived, e.g. because the connection dropped meanwhile
 * - "disconnected": the session ended or is reconnecting
 */
export type SubscriptionFailure = "rejected" | "timeout" | "disconnected";

export class SubscriptionError extends Error {
  constructor(message: string, readonly reason: SubscriptionFailure, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SubscriptionError";
  }
}

interface PendingRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function waitForConfirmation(
  pending: Map<string, PendingRequest>,
  description: string,
  send: (key: string) => void
): Promise<void> {
  const key = createUid();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(key);
      reject(
        new SubscriptionError(
          `The broker did not confirm ${description} within ${SUBSCRIPTION_TIMEOUT / 1000} s.`,
          "timeout"
        )
      );
    }, SUBSCRIPTION_TIMEOUT + 1000);
    pending.set(key, { resolve, reject, timer });
    try {
      send(key);
    } catch (error) {
      clearTimeout(timer);
      pending.delete(key);
      reject(new SubscriptionError(describeError(error), "rejected", { cause: error }));
    }
  });
}

function settle(pending: Map<string, PendingRequest>, key: unknown, error?: string) {
  if (typeof key !== "string") return;
  const request = pending.get(key);
  if (!request) return;
  pending.delete(key);
  clearTimeout(request.timer);
  if (error) {
    request.reject(new SubscriptionError(error, "rejected"));
  } else {
    request.resolve();
  }
}

function rejectAll(pending: Map<string, PendingRequest>, error: string) {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new SubscriptionError(error, "disconnected"));
  }
  pending.clear();
}

/** A bound queue consumer, topic endpoint consumer or queue browser. */
export class EndpointBinding {
  readonly id = createUid();
  private currentStatus: BindingStatus = { state: "binding" };
  private stopped = false;
  private readonly pendingSubscriptions = new Map<string, PendingRequest>();
  private statusListener: (status: BindingStatus) => void = () => {};

  constructor(
    readonly mode: QueueBindMode,
    readonly options: BindOptions,
    private readonly handle: solace.MessageConsumer | solace.QueueBrowser,
    private readonly onStopped: (binding: EndpointBinding) => void
  ) {}

  get status() {
    return this.currentStatus;
  }

  get isStopped() {
    return this.stopped;
  }

  onStatus(listener: (status: BindingStatus) => void) {
    this.statusListener = listener;
  }

  /** @internal */
  setStatus(status: BindingStatus) {
    if (this.stopped) return;
    this.currentStatus = { ...this.currentStatus, ...status };
    if (status.state === "down") {
      this.release();
    }
    this.statusListener(this.currentStatus);
  }

  /** @internal */
  settleSubscription(key: unknown, error?: string) {
    settle(this.pendingSubscriptions, key, error);
  }

  stop() {
    if (this.stopped) return;
    this.currentStatus = { ...this.currentStatus, state: "down", error: undefined };
    this.release();
    this.statusListener(this.currentStatus);
  }

  /** Adds a topic subscription to the bound queue (queues only). */
  addSubscription(topic: string) {
    return this.updateSubscription(topic, true);
  }

  removeSubscription(topic: string) {
    return this.updateSubscription(topic, false);
  }

  private updateSubscription(topic: string, add: boolean) {
    if (this.mode !== "consume" || this.options.type !== solace.QueueType.QUEUE) {
      return Promise.reject(new SubscriptionError("Topic subscriptions can only be added to queues.", "rejected"));
    }
    if (this.currentStatus.state !== "active" && this.currentStatus.state !== "standby") {
      return Promise.reject(new SubscriptionError("The queue is not bound.", "disconnected"));
    }
    const consumer = this.handle as solace.MessageConsumer;
    let destination: solace.Destination;
    try {
      destination = SolclientFactory.createTopicDestination(topic);
    } catch (error) {
      // This can run inside a solclientjs event listener, so never throw.
      return Promise.reject(new SubscriptionError(describeError(error), "rejected", { cause: error }));
    }
    return waitForConfirmation(this.pendingSubscriptions, `the queue subscription "${topic}"`, (key) =>
      add
        ? consumer.addSubscription(destination, key, SUBSCRIPTION_TIMEOUT)
        : consumer.removeSubscription(destination, key, SUBSCRIPTION_TIMEOUT)
    );
  }

  /** Removes a browsed message from the queue (browse mode only). */
  removeMessage(raw: solace.Message) {
    if (this.mode !== "browse") throw new Error("Only browsed messages can be removed.");
    (this.handle as solace.QueueBrowser).removeMessageFromQueue(raw);
  }

  private release() {
    if (this.stopped) return;
    this.stopped = true;
    rejectAll(this.pendingSubscriptions, "The endpoint was unbound.");
    try {
      this.handle.disconnect();
    } catch {
      // Already unbound, e.g. after DOWN_ERROR or a session disconnect.
    }
    try {
      (this.handle as { dispose?: () => void }).dispose?.();
      // QueueBrowser has no dispose(); release the consumer flow it wraps (private field)
      // so it does not stay registered with the session.
      (this.handle as { _messageConsumer?: { dispose?: () => void } })._messageConsumer?.dispose?.();
    } catch {
      // Ignore
    }
    this.onStopped(this);
  }
}

/**
 * Wraps one solclientjs session. The instance lives as long as its view; each connect()
 * creates a fresh session, and events from older sessions are ignored.
 */
class SolaceManager {
  private session: solace.Session | undefined;
  private state: ConnectionState = { status: ConnectionStatus.DISCONNECTED };
  private broker: BrokerConfig | undefined;
  private clientName: string | undefined;
  private inactivityTimeout: number;
  private inactivityTimer: ReturnType<typeof setTimeout> | undefined;
  private ignoreMatchers: RegExp[] = [];
  private readonly bindings = new Set<EndpointBinding>();
  private readonly pendingSubscriptions = new Map<string, PendingRequest>();
  private readonly trackedPublishes = new Set<string>();
  private readonly browsedMessages = new Map<string, { raw: solace.Message; binding: EndpointBinding }>();
  private readonly log: Logger;

  private stateListeners = new Set<(state: ConnectionState) => void>();
  private messageListener: (message: Message) => void = () => {};
  private ignoredListener: () => void = () => {};
  private publishResultListener: (result: PublishResult) => void = () => {};

  constructor(readonly role: ConnectionRole, inactivityTimeout: number) {
    this.inactivityTimeout = inactivityTimeout;
    this.log = createLogger(role);
  }

  // ---------------------------------------------------------------- listeners

  onStateChange(listener: (state: ConnectionState) => void) {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  setOnMessage(listener: (message: Message) => void, onIgnored: () => void = () => {}) {
    this.messageListener = listener;
    this.ignoredListener = onIgnored;
  }

  setOnPublishResult(listener: (result: PublishResult) => void) {
    this.publishResultListener = listener;
  }

  // ---------------------------------------------------------------- state

  getState() {
    return this.state;
  }

  isConnected() {
    return this.state.status === ConnectionStatus.CONNECTED;
  }

  getBroker() {
    return this.broker;
  }

  getClientName() {
    return this.clientName;
  }

  private setState(state: ConnectionState) {
    this.state = state;
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (error) {
        this.log.error(`State listener failed: ${describeError(error)}`);
      }
    }
  }

  // ---------------------------------------------------------------- connection

  connect({ broker, password, url, remoteName }: ConnectParams) {
    this.teardown("Reconnecting");
    this.broker = broker;
    this.clientName = undefined;
    this.setState({ status: ConnectionStatus.CONNECTING });

    const clientCertificate = broker.authScheme === "clientCertificate";
    const hintContext = {
      url,
      isDefaultLocalhost: broker.id === DEFAULT_LOCALHOST_BROKER_ID,
      remoteName,
      clientCertificate,
    };
    const fail = (error: unknown, reason: DisconnectReason) => {
      const text = describeError(error);
      const hint = connectionHint(error, hintContext);
      this.log.warn(`Connection to ${broker.title} ${reason === "down" ? "lost" : "failed"}: ${text}`);
      this.teardown("Disconnected");
      this.setState({ status: ConnectionStatus.DISCONNECTED, reason, error: text, hint });
    };

    try {
      const options = broker.sessionOptions ?? {};
      const urls = url
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
      const properties = new solace.SessionProperties({
        url: urls.length > 1 ? urls : urls[0] ?? "",
        vpnName: broker.vpn.trim(),
        // With a client certificate, an empty username lets the broker take it from the certificate.
        userName: broker.username.trim(),
        // The browser build has no certificate properties: VS Code (Chromium) picks the certificate
        // from the OS store when the broker asks for one in the TLS handshake.
        authenticationScheme: clientCertificate
          ? solace.AuthenticationScheme.CLIENT_CERTIFICATE
          : solace.AuthenticationScheme.BASIC,
        password: clientCertificate ? undefined : password,
        clientName: buildClientName(options.clientName, this.role),
        applicationDescription: "Solace Try Me (VS Code)",
        connectTimeoutInMsecs: options.connectTimeoutInMsecs ?? 10000,
        // Retrying a bad password 20 times only delays the error and floods the broker log.
        connectRetries: options.connectRetries ?? 1,
        reconnectRetries: options.reconnectRetries ?? 20,
        reconnectRetryWaitInMsecs: options.reconnectRetryWaitInMsecs ?? 3000,
        // Without this, an automatic reconnect silently drops all topic subscriptions.
        reapplySubscriptions: options.reapplySubscriptions ?? true,
        generateReceiveTimestamps: true,
      });
      const session = SolclientFactory.createSession(properties);
      this.session = session;
      this.attachSessionListeners(session, fail);
      this.log.info(`Connecting to ${broker.title} (${redactUrl(url)}, VPN ${broker.vpn})`);
      session.connect();
    } catch (error) {
      fail(error, "failed");
    }
  }

  disconnect(reason: DisconnectReason = "user", error?: string) {
    const hadSession = !!this.session;
    this.teardown("Disconnected");
    if (hadSession || this.state.status !== ConnectionStatus.DISCONNECTED) {
      if (hadSession) {
        this.log.info(`Disconnected (${reason})${error ? `: ${error}` : ""}`);
      }
      this.setState({ status: ConnectionStatus.DISCONNECTED, reason, error });
    }
  }

  /** Releases the session and everything bound to it, without reporting a state change. */
  private teardown(why: string) {
    this.clearInactivityTimer();
    for (const binding of [...this.bindings]) {
      binding.setStatus({ state: "down" });
    }
    this.bindings.clear();
    this.browsedMessages.clear();
    rejectAll(this.pendingSubscriptions, why);
    if (this.trackedPublishes.size) {
      for (const id of this.trackedPublishes) {
        this.publishResultListener({ id, ok: false, error: `${why} before the broker acknowledged the message.` });
      }
      this.trackedPublishes.clear();
    }

    const session = this.session;
    this.session = undefined;
    if (!session) return;
    try {
      session.disconnect();
    } catch {
      // The session never came up (e.g. still NEW) or is already down.
    }
    // Give the disconnect handshake a moment before releasing the session.
    setTimeout(() => {
      try {
        session.dispose();
      } catch {
        // Ignore
      }
    }, 2000);
  }

  private attachSessionListeners(
    session: solace.Session,
    fail: (error: unknown, reason: DisconnectReason) => void
  ) {
    const current = () => this.session === session;
    const on = (event: solace.SessionEventCode, handler: (...args: never[]) => void) =>
      session.on(event, (...args: unknown[]) => {
        if (current()) (handler as (...a: unknown[]) => void)(...args);
      });
    const Code = solace.SessionEventCode;

    on(Code.UP_NOTICE, () => {
      this.clientName = safeRead(() => session.getSessionProperties().clientName);
      this.log.info(`Connected as ${this.clientName ?? "?"}`);
      this.setState({ status: ConnectionStatus.CONNECTED });
      this.touch();
    });
    on(Code.CONNECT_FAILED_ERROR, (event: solace.SessionEvent) => fail(event, "failed"));
    on(Code.DOWN_ERROR, (event: solace.SessionEvent) => fail(event, "down"));
    on(Code.DISCONNECTED, () => fail("The broker closed the connection.", "down"));
    on(Code.RECONNECTING_NOTICE, (event: solace.SessionEvent) => {
      this.log.warn(`Connection interrupted, reconnecting: ${describeError(event)}`);
      this.clearInactivityTimer();
      this.setState({ status: ConnectionStatus.RECONNECTING, error: describeError(event) });
    });
    on(Code.RECONNECTED_NOTICE, () => {
      this.log.info("Reconnected");
      this.setState({ status: ConnectionStatus.CONNECTED });
      this.touch();
    });
    on(Code.SUBSCRIPTION_OK, (event: solace.SessionEvent) =>
      settle(this.pendingSubscriptions, event.correlationKey)
    );
    on(Code.SUBSCRIPTION_ERROR, (event: solace.SessionEvent) => {
      const error = describeError(event);
      this.log.warn(`Subscription rejected: ${error}`);
      settle(this.pendingSubscriptions, event.correlationKey, error);
    });
    on(Code.ACKNOWLEDGED_MESSAGE, (event: solace.SessionEvent) => {
      const id = event.correlationKey as unknown;
      if (typeof id === "string" && this.trackedPublishes.delete(id)) {
        this.publishResultListener({ id, ok: true });
      }
    });
    on(Code.REJECTED_MESSAGE_ERROR, (event: solace.SessionEvent) => {
      const id = event.correlationKey as unknown;
      const error = describeError(event);
      this.log.warn(`Message rejected by the broker: ${error}`);
      if (typeof id === "string") {
        this.trackedPublishes.delete(id);
        this.publishResultListener({ id, ok: false, error });
      }
    });
    on(Code.GUARANTEED_MESSAGE_PUBLISHER_DOWN, (event: solace.SessionEvent) => {
      const error = describeError(event);
      this.log.warn(`Guaranteed publisher is down: ${error}`);
      for (const id of this.trackedPublishes) {
        this.publishResultListener({ id, ok: false, error });
      }
      this.trackedPublishes.clear();
    });
    on(Code.MESSAGE, (message: solace.Message) => this.receive(message, "direct"));
  }

  // ---------------------------------------------------------------- inactivity

  setInactivityTimeout(ms: number) {
    this.inactivityTimeout = ms;
    if (this.isConnected()) this.touch();
  }

  /** Any user action or traffic counts as activity. */
  touch() {
    this.clearInactivityTimer();
    const ms = this.inactivityTimeout;
    if (!this.session || !Number.isFinite(ms) || ms <= 0) return;
    this.inactivityTimer = setTimeout(() => {
      const minutes = Math.round(ms / 60000);
      this.disconnect(
        "inactivity",
        `Disconnected after ${minutes} minute${minutes === 1 ? "" : "s"} without activity. You can change this in the extension settings.`
      );
    }, Math.min(ms, MAX_TIMEOUT));
  }

  private clearInactivityTimer() {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = undefined;
  }

  // ---------------------------------------------------------------- receiving

  setIgnoreTopics(patterns: string[]) {
    this.ignoreMatchers = patterns.flatMap((pattern) => {
      try {
        return [solaceTopicToRegExp(pattern)];
      } catch {
        return [];
      }
    });
  }

  private receive(raw: solace.Message, source: "direct" | "queue" | "browse", binding?: EndpointBinding) {
    // Never let an exception escape: for queue consumers it would suppress the
    // acknowledgement and the message would be redelivered forever.
    try {
      this.touch();
      if (source === "direct" && this.ignoreMatchers.length) {
        const topic = raw.getDestination()?.getName() ?? "";
        if (this.ignoreMatchers.some((m) => m.test(topic))) {
          this.ignoredListener();
          return;
        }
      }
      const message = decodeMessage(raw, source);
      if (source === "browse" && binding) {
        this.browsedMessages.set(message._extension_uid, { raw, binding });
        if (this.browsedMessages.size > MAX_BROWSED_MESSAGES) {
          const oldest = this.browsedMessages.keys().next().value;
          if (oldest !== undefined) this.browsedMessages.delete(oldest);
        }
      }
      this.messageListener(message);
    } catch (error) {
      this.log.error(`Could not process a received message: ${describeError(error)}`);
    }
  }

  // ---------------------------------------------------------------- subscriptions

  private requireSession() {
    if (!this.session || !this.isConnected()) {
      throw new Error(
        this.state.status === ConnectionStatus.RECONNECTING
          ? "The connection is being re-established. Try again in a moment."
          : "Not connected."
      );
    }
    return this.session;
  }

  /** Resolves when the broker confirms the subscription. */
  subscribe(topic: string): Promise<void> {
    let session: solace.Session;
    let destination: solace.Destination;
    try {
      session = this.requireSession();
    } catch (error) {
      return Promise.reject(new SubscriptionError((error as Error).message, "disconnected"));
    }
    try {
      destination = SolclientFactory.createTopicDestination(topic);
    } catch (error) {
      return Promise.reject(new SubscriptionError(describeError(error), "rejected", { cause: error }));
    }
    this.touch();
    return waitForConfirmation(this.pendingSubscriptions, `the subscription "${topic}"`, (key) =>
      session.subscribe(destination, true, key, SUBSCRIPTION_TIMEOUT)
    ).then(() => this.log.info(`Subscribed to ${topic}`));
  }

  unsubscribe(topic: string): Promise<void> {
    if (this.state.status === ConnectionStatus.RECONNECTING) {
      // solclientjs re-applies its subscriptions after reconnecting; this one would come back.
      return Promise.reject(new SubscriptionError("The connection is being re-established.", "disconnected"));
    }
    if (!this.session || !this.isConnected()) {
      // Subscriptions end with the session.
      return Promise.resolve();
    }
    const session = this.session;
    let destination: solace.Destination;
    try {
      destination = SolclientFactory.createTopicDestination(topic);
    } catch (error) {
      return Promise.reject(new SubscriptionError(describeError(error), "rejected", { cause: error }));
    }
    this.touch();
    return waitForConfirmation(this.pendingSubscriptions, `removing "${topic}"`, (key) =>
      session.unsubscribe(destination, true, key, SUBSCRIPTION_TIMEOUT)
    ).then(() => this.log.info(`Unsubscribed from ${topic}`));
  }

  // ---------------------------------------------------------------- endpoints

  /** Binds to a queue or topic endpoint as a consumer, or opens a queue browser. Throws on invalid input. */
  bind(options: BindOptions): EndpointBinding {
    const session = this.requireSession();
    this.touch();
    const type = options.type;
    const temporary = options.temporary === true && type === solace.QueueType.QUEUE && options.mode === "consume";
    const name = options.name?.trim() ?? "";
    if (!temporary && !name) throw new Error("Enter an endpoint name.");

    if (options.mode === "browse") {
      if (type !== solace.QueueType.QUEUE) throw new Error("Only queues can be browsed.");
      const properties = new solace.QueueBrowserProperties();
      properties.queueDescriptor = new solace.QueueDescriptor({ name, type });
      const browser = session.createQueueBrowser(properties);
      const binding = new EndpointBinding("browse", options, browser, (b) => this.forgetBinding(b));
      this.bindings.add(binding);
      const E = solace.QueueBrowserEventName;
      browser.on(E.UP, () => binding.setStatus({ state: "active", endpointName: name }));
      browser.on(E.DOWN, () => binding.setStatus({ state: "down" }));
      browser.on(E.DOWN_ERROR, (e) => binding.setStatus({ state: "down", error: describeError(e) }));
      browser.on(E.CONNECT_FAILED_ERROR, (e) => binding.setStatus({ state: "down", error: describeError(e) }));
      browser.on(E.GM_DISABLED, () =>
        binding.setStatus({ state: "down", error: "Guaranteed messaging is not available on this connection." })
      );
      browser.on(E.MESSAGE, (m) => this.receive(m, "browse", binding));
      this.connectEndpoint(browser, binding);
      this.log.info(`Browsing queue ${name}`);
      return binding;
    }

    const properties = new solace.MessageConsumerProperties();
    // A temporary queue is described without a name (the broker assigns one), which only
    // AbstractQueueDescriptor accepts. Its constructor is public at runtime.
    const AbstractDescriptor = solace.AbstractQueueDescriptor as unknown as new (spec: {
      type: solace.QueueType;
      durable: boolean;
    }) => solace.QueueDescriptor;
    properties.queueDescriptor = temporary
      ? new AbstractDescriptor({ type, durable: false })
      : new solace.QueueDescriptor({ name, type });
    if (type === solace.QueueType.TOPIC_ENDPOINT) {
      const topic = options.topic?.trim();
      if (!topic) throw new Error("Enter the topic endpoint's subscription topic.");
      properties.topicEndpointSubscription = SolclientFactory.createTopicDestination(topic);
    } else if (!temporary) {
      // Lets the UI tell an active flow from a standby one on exclusive queues.
      properties.activeIndicationEnabled = true;
    }
    if (options.createIfMissing && !temporary) properties.createIfMissing = true;

    const consumer = session.createMessageConsumer(properties);
    const binding = new EndpointBinding("consume", options, consumer, (b) => this.forgetBinding(b));
    this.bindings.add(binding);
    const E = solace.MessageConsumerEventName;
    // With active indication, UP comes first and ACTIVE follows right away for an active flow;
    // a standby flow gets no further event. Without it, a bound flow is always active.
    const upState: BindingState = properties.activeIndicationEnabled ? "standby" : "active";
    consumer.on(E.UP, () =>
      binding.setStatus({
        state: upState,
        endpointName: safeRead(() => consumer.getDestination()?.getName()) ?? name,
      })
    );
    consumer.on(E.ACTIVE, () => binding.setStatus({ state: "active" }));
    consumer.on(E.INACTIVE, () =>
      // A session reconnect also ends the active state; that is not a standby flow.
      binding.setStatus({ state: this.state.status === ConnectionStatus.RECONNECTING ? "reconnecting" : "standby" })
    );
    consumer.on(E.RECONNECTING, () => binding.setStatus({ state: "reconnecting" }));
    consumer.on(E.RECONNECTED, () => binding.setStatus({ state: upState }));
    consumer.on(E.DOWN, () => binding.setStatus({ state: "down" }));
    consumer.on(E.DOWN_ERROR, (e) => binding.setStatus({ state: "down", error: describeError(e) }));
    consumer.on(E.CONNECT_FAILED_ERROR, (e) => binding.setStatus({ state: "down", error: describeError(e) }));
    consumer.on(E.GM_DISABLED, () =>
      binding.setStatus({ state: "down", error: "Guaranteed messaging is not available on this connection." })
    );
    consumer.on(E.SUBSCRIPTION_OK, (e) => binding.settleSubscription(e.correlationKey));
    consumer.on(E.SUBSCRIPTION_ERROR, (e) => binding.settleSubscription(e.correlationKey, describeError(e)));
    consumer.on(E.MESSAGE, (m) => this.receive(m, "queue", binding));
    this.connectEndpoint(consumer, binding);
    this.log.info(
      `Binding to ${temporary ? "a temporary queue" : `${type === solace.QueueType.QUEUE ? "queue" : "topic endpoint"} ${name}`}`
    );
    return binding;
  }

  private connectEndpoint(handle: { connect(): void }, binding: EndpointBinding) {
    try {
      handle.connect();
    } catch (error) {
      binding.setStatus({ state: "down", error: describeError(error) });
      throw new Error(describeError(error), { cause: error });
    }
  }

  private forgetBinding(binding: EndpointBinding) {
    this.bindings.delete(binding);
    for (const [uid, entry] of this.browsedMessages) {
      if (entry.binding === binding) this.browsedMessages.delete(uid);
    }
  }

  canRemoveBrowsedMessage(uid: string) {
    const entry = this.browsedMessages.get(uid);
    return !!entry && !entry.binding.isStopped && entry.binding.status.state === "active" && this.isConnected();
  }

  removeBrowsedMessage(uid: string) {
    const entry = this.browsedMessages.get(uid);
    if (!entry || !this.canRemoveBrowsedMessage(uid)) {
      throw new Error("The browser for this message is not open or is reconnecting.");
    }
    entry.binding.removeMessage(entry.raw);
    this.browsedMessages.delete(uid);
    this.touch();
  }

  // ---------------------------------------------------------------- publishing

  /**
   * Sends a message. Guaranteed messages are reported later through setOnPublishResult.
   * Throws a readable Error when the message cannot be sent.
   */
  publish(destination: string, content: string, options: PublishOptions = {}): { id: string; tracked: boolean } {
    const session = this.requireSession();
    const message = buildOutgoingMessage(destination, content, options);
    const id = createUid();
    message.setCorrelationKey(id);
    const tracked = (options.deliveryMode ?? solace.MessageDeliveryModeType.DIRECT) !== solace.MessageDeliveryModeType.DIRECT;
    if (tracked) this.trackedPublishes.add(id);
    try {
      session.send(message);
    } catch (error) {
      this.trackedPublishes.delete(id);
      throw new Error(describeError(error), { cause: error });
    }
    this.touch();
    return { id, tracked };
  }

  /** Sends a request and waits for the reply. */
  request(
    destination: string,
    content: string,
    options: PublishOptions,
    timeoutMs: number
  ): Promise<{ reply: Message; rttMs: number }> {
    let session: solace.Session;
    let message: solace.Message;
    try {
      session = this.requireSession();
      message = buildOutgoingMessage(destination, content, { ...options, replyToTopic: undefined });
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(describeError(error)));
    }
    this.touch();
    const started = performance.now();
    return new Promise((resolve, reject) => {
      try {
        session.sendRequest(
          message,
          timeoutMs,
          (_session, reply) => {
            this.touch();
            resolve({ reply: decodeMessage(reply, "reply"), rttMs: Math.round(performance.now() - started) });
          },
          (_session, error) => reject(new Error(describeError(error)))
        );
      } catch (error) {
        reject(new Error(describeError(error)));
      }
    });
  }

  // ---------------------------------------------------------------- diagnostics

  getConnectionInfo(): ConnectionInfo | undefined {
    const session = this.session;
    if (!session || !this.isConnected()) return undefined;
    const C = solace.CapabilityType;
    const capability = (type: solace.CapabilityType) =>
      safeRead(() => session.getCapability(type)?.getValue() as unknown);
    const capable = (type: solace.CapabilityType) => safeRead(() => session.isCapable(type)) === true;
    const S = solace.StatType;
    const stat = (type: solace.StatType) => safeRead(() => session.getStat(type)) ?? 0;
    return {
      clientName: this.clientName,
      brokerVersion: capability(C.PEER_SOFTWARE_VERSION) as string | undefined,
      routerName: capability(C.PEER_ROUTER_NAME) as string | undefined,
      platform: capability(C.PEER_PLATFORM) as string | undefined,
      maxDirectMessageSize: capability(C.MAX_DIRECT_MSG_SIZE) as number | undefined,
      maxGuaranteedMessageSize: capability(C.MAX_GUARANTEED_MSG_SIZE) as number | undefined,
      capabilities: {
        "Guaranteed publish": capable(C.GUARANTEED_MESSAGE_PUBLISH),
        "Guaranteed consume": capable(C.GUARANTEED_MESSAGE_CONSUME),
        "Queue browsing": capable(C.GUARANTEED_MESSAGE_BROWSE),
        "Temporary endpoints": capable(C.TEMPORARY_ENDPOINT),
        "Endpoint management": capable(C.ENDPOINT_MGMT),
        "Queue subscriptions": capable(C.QUEUE_SUBSCRIPTIONS),
        "Active consumer indication": capable(C.ACTIVE_CONSUMER_INDICATION),
        "Shared subscriptions": capable(C.SHARED_SUBSCRIPTIONS),
        "Message replay": capable(C.MESSAGE_REPLAY),
      },
      stats: {
        "Messages sent": stat(S.TX_TOTAL_DATA_MSGS),
        "Bytes sent": stat(S.TX_TOTAL_DATA_BYTES),
        "Acks received": stat(S.TX_ACKS_RXED),
        "Messages received": stat(S.RX_TOTAL_DATA_MSGS),
        "Bytes received": stat(S.RX_TOTAL_DATA_BYTES),
        "Discard indications": stat(S.RX_DISCARD_MSG_INDICATION),
      },
    };
  }
}

function safeRead<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

function buildClientName(template: string | undefined, role: ConnectionRole): string | undefined {
  const random = Math.random().toString(36).slice(2, 8);
  const value = (template?.trim() || "try-me-vsc/{role}/{random}")
    .replace(/\{role\}/g, role)
    .replace(/\{random\}/g, random);
  return value.slice(0, 160) || undefined;
}

/** Hides credentials that may be embedded in a URL. */
export function redactUrl(url: string) {
  return url.replace(/\/\/[^/@]*@/g, "//***@");
}

export default SolaceManager;
