import solace, { SolclientFactory } from "solclientjs";
import { BrokerConfig, Message, PublishOptions } from "./interfaces";

type onMessageCallback = (message: Message) => void;

class SolaceManager {
  session: solace.Session | undefined;
  isConnected = false;
  onMessage!: onMessageCallback;
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

  handleMessage(message: solace.Message) {
    const destination = message.getDestination();
    const topic = destination ? destination.getName() : "unknown";
    const payload = message.getBinaryAttachment()?.toString() ?? "";
    const metadata: Message["metadata"] = {
      deliveryMode: message.getDeliveryMode(),
      isDMQEligible: message.isDMQEligible(),
      ttl: message.getTimeToLive(),
      priority: message.getPriority(),
      replyTo: message.getReplyTo()?.getName() || null,
      senderId: message.getSenderId(),
      correlationId: message.getCorrelationId(),
      redelivered: message.isRedelivered(),
      senderTimestamp: message.getSenderTimestamp(),
      receiverTimestamp: message.getReceiverTimestamp() ?? Date.now(),
    };

    const userProperties: { [key: string]: unknown } = {};
    const userPropertyMap = message.getUserPropertyMap();
    if (userPropertyMap) {
      userPropertyMap.getKeys().forEach((key) => {
        userProperties[key] = userPropertyMap.getField(key);
      });
    }
    const messageObj = { topic, payload, userProperties, metadata };
    console.debug("Received message:", messageObj);
    this.onMessage(messageObj);
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

    this.session.on(
      solace.SessionEventCode.MESSAGE,
      this.handleMessage.bind(this)
    );
  }

  setOnMessage(onMessage: onMessageCallback) {
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

  unsubscribe(topic: string) {
    try {
      if (!this.session) {
        throw new Error("Session not initialized");
      }
      this.session.unsubscribe(
        SolclientFactory.createTopicDestination(topic),
        true,
        topic,
        10000
      );
      console.log("Unsubscribed from topic:", topic);
    } catch (unsubscribeError) {
      console.error("Error unsubscribing from topic:", topic, unsubscribeError);
    }
  }

  consumeQueue(
    name: string,
    type: solace.QueueType,
    onError: (error: Error) => void
  ) {
    try {
      if (!this.session) {
        throw new Error("Session not initialized");
      }

      const consumerProperties = new solace.MessageConsumerProperties();
      consumerProperties.queueDescriptor = new solace.QueueDescriptor({
        name,
        type,
      });

      const messageConsumer =
        this.session.createMessageConsumer(consumerProperties);

      messageConsumer.on(
        solace.MessageConsumerEventName.MESSAGE,
        this.handleMessage.bind(this)
      );

      messageConsumer.on(
        solace.MessageConsumerEventName.CONNECT_FAILED_ERROR,
        (error) => {
          onError(error);
          console.log("Consumer connect failed:", error);
          messageConsumer.disconnect();
        }
      );

      // Set up other event listeners as needed
      messageConsumer.connect();

      return messageConsumer;
    } catch (consumeError) {
      console.error("Error consuming queue:", name, consumeError);
    }
  }

  publish(
    name: string,
    content: string,
    options: PublishOptions = {}
  ): Error | void {
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
      return;
    } catch (publishError: unknown) {
      console.error("Error publishing message:", name, content, publishError);
      return publishError as Error;
    }
  }

  disconnect() {
    if (this.session) {
      console.log("Disconnecting Solace session.");
      this.session.removeAllListeners();
      this.session.disconnect();
      this.isConnected = false;
      this.session = undefined;
    }
  }
}

export default SolaceManager;
