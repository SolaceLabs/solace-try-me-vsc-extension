import solace, { SolclientFactory } from "solclientjs";
import { BrokerConfig, PublishOptions } from "./interfaces";

class SolaceManager {
  session: solace.Session | undefined;
  isConnected = false;
  onMessage!: (topic: string, content: unknown) => void;
  brokerConfig!: BrokerConfig;
  onConnectionStateChange!: (
    isConnected: boolean,
    error: string | null
  ) => void;

  constructor(config?: BrokerConfig) {
    if (config) {
      this.brokerConfig = config;
    }
  }

  async connect(config?: BrokerConfig) {
    if (config) {
      this.brokerConfig = config;
    }
    try {
      // Initialize Solace client factory
      SolclientFactory.init();

      // Create session
      const properties = new solace.SessionProperties({
        url: this.brokerConfig.url,
        vpnName: this.brokerConfig.vpn,
        userName: this.brokerConfig.username,
        password: this.brokerConfig.password,
      });

      this.session = SolclientFactory.createSession(properties);

      // Define session event listeners
      this.session.on(solace.SessionEventCode.UP_NOTICE, () => {
        this.isConnected = true;
        console.debug("Solace session connected");
        if (this.onConnectionStateChange) {
          this.onConnectionStateChange(this.isConnected, null);
        }
      });

      this.session.on(
        solace.SessionEventCode.CONNECT_FAILED_ERROR,
        (sessionEvent) => {
          this.isConnected = false;
          console.error("Solace connection failed:", sessionEvent.message);
          if (this.onConnectionStateChange) {
            this.onConnectionStateChange(
              this.isConnected,
              sessionEvent.message
            );
          }
        }
      );

      this.session.on(solace.SessionEventCode.DISCONNECTED, () => {
        this.isConnected = false;
        console.debug("Solace session disconnected");
        if (this.onConnectionStateChange) {
          this.onConnectionStateChange(this.isConnected, null);
        }
      });

      // Connect the session
      this.session.connect();
    } catch (error) {
      console.error("Error creating Solace session:", error);
      throw error;
    }

    this.session.on(solace.SessionEventCode.MESSAGE, (message) => {
      const destination = message.getDestination();
      const topic = destination ? destination.getName() : "unknown";
      const binaryAttachment = message.getBinaryAttachment();
      const content = binaryAttachment
        ? JSON.parse(binaryAttachment as string)
        : {};
      const userProperties: { [key: string]: unknown } = {};
      const userPropertyMap = message.getUserPropertyMap();
      if (userPropertyMap) {
        userPropertyMap.getKeys().forEach((key) => {
          userProperties[key] = userPropertyMap.getField(key);
        });
      }
      console.debug("Received message:", topic, content, userProperties);
      this.onMessage(topic, content);
    });
  }

  setOnMessage(onMessage: (topic: string, content: unknown) => void) {
    this.onMessage = onMessage;
  }

  subscribe(topic: string) {
    try {
      if (!this.session) {
        throw new Error("Session not initialized");
      }
      this.session.subscribe(
        SolclientFactory.createTopicDestination(topic),
        true,
        topic,
        10000
      );
      console.log("Subscribed to topic:", topic);
    } catch (subscribeError) {
      console.error("Error subscribing to topic:", topic, subscribeError);
    }
  }

  publish(name: string, content: string, options: PublishOptions = {}) {
    try {
      if (!this.session) {
        throw new Error("Session not initialized");
      }
      const message = SolclientFactory.createMessage();
      if (options.destinationType !== undefined) {
        if (options.destinationType === solace.DestinationType.QUEUE) {
          message.setDestination(
            SolclientFactory.createDurableQueueDestination(name)
          );
        } else if (options.destinationType === solace.DestinationType.TOPIC) {
          message.setDestination(SolclientFactory.createTopicDestination(name));
        }
      } else {
        message.setDestination(SolclientFactory.createTopicDestination(name));
      }
      if (options.deliveryMode !== undefined) {
        message.setDeliveryMode(options.deliveryMode);
      }
      if (options.dmqEligible !== undefined) {
        message.setDMQEligible(options.dmqEligible);
      }
      if (options.replyToTopic !== undefined) {
        message.setReplyTo(
          SolclientFactory.createTopicDestination(options.replyToTopic)
        );
      }
      if (options.priority !== undefined) {
        message.setPriority(options.priority);
      }
      if (options.timeToLive !== undefined) {
        message.setTimeToLive(options.timeToLive * 1e3);
      }
      if (options.correlationId !== undefined) {
        message.setCorrelationId(options.correlationId);
      }
      message.setBinaryAttachment(content);
      this.session.send(message);
      console.debug("Published message:", name, content, options);
      return null
    } catch (publishError) {
      console.error("Error publishing message:", name, content, publishError);
      return publishError;
    }
  }

  disconnect() {
    if (this.session) {
      console.log("Disconnecting Solace session.");
      this.session.disconnect();
      this.isConnected = false;
      this.session = undefined;
    }
  }
}

export default SolaceManager;
