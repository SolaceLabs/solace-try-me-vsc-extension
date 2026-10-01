[![version](https://img.shields.io/github/package-json/v/SolaceLabs/solace-try-me-vsc-extension)](https://github.com/SolaceLabs/solace-try-me-vsc-extension)
[![License](https://img.shields.io/github/license/SolaceLabs/solace-try-me-vsc-extension)](https://github.com/SolaceLabs/solace-try-me-vsc-extension/blob/main/LICENSE)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v2.0%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)

[![GitHub issues](https://img.shields.io/github/issues/SolaceLabs/solace-try-me-vsc-extension?color=red)](https://github.com/SolaceLabs/solace-try-me-vsc-extension/issues)
[![GitHub closed issues](https://img.shields.io/github/issues-closed/SolaceLabs/solace-try-me-vsc-extension?color=green)](https://github.com/SolaceLabs/solace-try-me-vsc-extension/issues?q=is%3Aissue+is%3Aclosed)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/SolaceLabs/solace-try-me-vsc-extension?color=red)](https://github.com/SolaceLabs/solace-try-me-vsc-extension/pulls)
[![GitHub closed pull requests](https://img.shields.io/github/issues-pr-closed/SolaceLabs/solace-try-me-vsc-extension?color=green)](https://github.com/SolaceLabs/solace-try-me-vsc-extension/pulls?q=is%3Apr+is%3Aclosed)
[![GitHub stars](https://img.shields.io/github/stars/SolaceLabs/solace-try-me-vsc-extension?style=social)](https://github.com/SolaceLabs/solace-try-me-vsc-extension/stargazers)


# Solace Try Me VSC Extension

Solace Try Me VSC Extension is a Visual Studio Code extension that allows you to monitor all messages in your event broker directly from within Visual Studio Code.

## Features

**Subscribe**
- Subscribe to topics with Solace wildcards (`*`, `prefix*`, `>`). Subscriptions are confirmed by the broker, and rejected ones show the reason.
- Consume queues and topic endpoints, or **browse a queue without removing messages** and delete individual messages from it.
- Temporary queues with topic subscriptions, and "create if missing" for durable endpoints.
- Hide noisy topics with ignore patterns and pause the live stream.
- Search the topic, payload, user properties or all of them, with match case, regular expressions and "hide matches". Quick filters narrow the list by source (direct, queue, browsed, reply), delivery mode, message type, redelivered and user properties.
- Payloads are decoded by message type (Text, Bytes, Map, Stream). Show each payload as raw text, pretty JSON (when that keeps the exact values), a hex dump or base64; binary data that is not UTF-8 starts as base64.
- From a message: filter the list to its topic, ignore or subscribe to the topic, copy the topic, open the message in an editor tab, copy it to the Publish section, or resend it as-is.
- Select messages, or take the whole filtered list, and export them as a ZIP with one JSON file per message.

**Publish**
- Publish to topics or queues as Text or Bytes messages, with user properties and headers (priority, TTL, DMQ eligible, reply-to, correlation ID, application message ID and type).
- Persistent messages are tracked until the broker acknowledges or rejects them, and rejections show the reason.
- Request/Reply mode sends a request and shows the reply with its round-trip time.
- A publish history to reload or resend recent messages.

**Connections**
- Broker profiles with host lists for failover, client name and reconnect settings, and a **Test connection** button.
- Passwords are stored in your operating system's keychain (VS Code SecretStorage), or requested on every connect.
- **Client certificate authentication** over `wss://`: VS Code presents a certificate from your operating system's certificate store (Keychain on macOS, the personal certificate store on Windows, the NSS database `~/.pki/nssdb` on Linux). The username can come from the certificate.
- Automatic reconnects re-apply subscriptions. A status bar item shows open connections, and you are notified when one drops.
- Clear connection errors with hints, a "Solace Try Me" output channel (**Show Logs**) and **Copy Diagnostics** for bug reports.

**General**
- Save presets for publish and subscribe, open several Try Me tabs, and keep your form state when a view is reloaded.
- A command to start a local broker with Docker (**Solace Try Me: Start a Local Broker (Docker)**).
- Supports light, dark and high contrast themes.

## Requirements

A local or cloud Solace PubSub+ event broker, reachable over its web transport (`ws://` or `wss://`, usually port 8008 or 443). Run **Solace Try Me: Start a Local Broker (Docker)** to start one locally.

## Development

To run this extension locally, follow the instructions in the [DEVELOPMENT.md](DEVELOPMENT.md) file.

## Known Issues

- Connections are opened from VS Code's webview, so `tcp://` and `tcps://` URLs cannot be used, and TLS brokers need a certificate trusted by your operating system (self-signed certificates are rejected).
- In remote windows (SSH, WSL, Dev Containers, Codespaces) the connection opens from your local machine. If the broker runs in the remote workspace, turn on **Forward through VS Code in remote windows** in the broker profile's advanced settings.
- Client certificate authentication only uses certificates installed, with their private key, in your operating system's certificate store. Certificate and key files (PFX, PEM) cannot be selected, and there is no certificate picker: VS Code sends the first certificate that matches the CAs the broker asks for. Solace brokers may not send a list of accepted CAs, and then every installed client certificate matches: with several installed, the first one may not be the one you want. The broker's own certificate must be trusted by your operating system.
- Consuming a queue acknowledges, and therefore removes, every message it receives. Use **Browse** to inspect a queue without changing it.

You can report other issues on the GitHub repository.

## Resources
This is not an officially supported Solace product.

For more information try these resources:
- Ask the [Solace Community](https://solace.community)
- The Solace Developer Portal website at: https://solace.dev


## Contributing

Contributions are encouraged! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## Authors

See the list of [contributors](https://github.com/SolaceLabs/solace-try-me-vsc-extension/graphs/contributors) who participated in this project.

## Release Notes

Check out the [CHANGELOG](CHANGELOG.md) for details on changes in each release.

## License

See the [LICENSE](LICENSE) file for details.
