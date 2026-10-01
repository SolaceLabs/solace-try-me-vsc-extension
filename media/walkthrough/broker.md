# Start a broker

Solace Try Me connects to any Solace PubSub+ event broker over its web transport (WebSocket).

**Local broker with Docker**

```sh
docker run -d -p 8080:8080 -p 55555:55555 -p 8008:8008 -p 1883:1883 -p 5672:5672 -p 9000:9000 \
  --shm-size=1g --env username_admin_globalaccesslevel=admin --env username_admin_password=admin \
  --name=solace solace/solace-pubsub-standard
```

The broker takes about a minute to start. Its web transport listens on `ws://localhost:8008`, and Broker Manager is at http://localhost:8080 (admin / admin).

**Solace Cloud**

Create a free service at https://console.solace.cloud, then copy the "Solace Web Messaging" connection details (a `wss://` URL, Message VPN, username and password) into a new broker profile.
