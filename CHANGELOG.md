# Change Log

All notable changes to the "solace-try-me-vsc-extension" extension will be documented in this file.

## [0.1.3] - 2026-10-01

### New
- Client certificate authentication, as a preview (#27): feedback on how it works with your broker and certificate store is welcome. Choose **Client certificate** under **Authentication** in a broker profile: VS Code presents a certificate from your operating system's certificate store during the TLS handshake (`wss://` or `https://` URLs only). The username is optional; leave it empty to use the one the broker takes from the certificate. Profiles saved by earlier versions keep using username and password. See Known Issues in the README for the limitations, and how to choose a certificate on macOS.
- Connection errors for client certificates explain what to check: a rejected or missing certificate, client certificate authentication turned off on the Message VPN, or a failed TLS handshake.

## [0.1.2] - 2026-10-01

### New
- Message search can be limited to the topic, the payload or the user properties, and has **Match case**, **Use regular expression** and **Hide matches** toggles. An invalid regular expression is shown under the filter instead of filtering. The filter is kept when the view is reloaded.
- **Quick filters** narrow the message list by source (Direct, Queue, Browsed, Reply), delivery mode (Direct, Persistent, Non-Persistent), message type (Text, Binary, Map, Stream), redelivered messages and messages with user properties. They combine with the search, and the list shows "Showing X of Y".
- Topic actions on each message: filter the list to this topic, ignore this topic (adds it to Ignore Topics), subscribe to this topic and copy the topic.
- Each payload can be shown as Raw, Pretty JSON, Hex or Base64. Pretty JSON is offered only when it keeps the payload's exact values (no large or reformatted numbers or duplicate keys). Binary payloads start as Base64. The maximum visible payload length still applies.
- Select messages (with "Select all listed" and "Clear selection") and **Export selected as ZIP**, or **Export listed as ZIP**. The archive has one JSON file per message, with the same content as "Open in VS Code", named like `0001_orders-created_2026-10-01T14-17-28-124Z.json`. VS Code asks where to save it, starting in the workspace folder.

### Changed
- The "Export the listed messages as JSON" button is removed; use **Export listed as ZIP**.
- "Clear Fields", "Clear Messages" and "Clear Stats" (Subscribe) and "Clear Stats" and "Clear Fields" (Publish) are icon buttons with tooltips, like the message list toolbar.

## [0.1.1] - 2026-10-01
- Settings: the info tooltips next to the switches show on hover again.
- Removed the Getting Started walkthrough and its command, menu entry and links. "Start a Local Broker (Docker)" is still available.
- Subscribe: the notice after "Resend as-is" goes away on its own (or with its close button) and no longer touches the filter field.
- Subscribe: "Clear Fields", "Clear Messages" and "Clear Stats" sit in one row aligned to the bottom, with "Clear Fields" first.

## [0.1.0] - 2026-10-01

### Upgrade notes
- Saved broker passwords move to VS Code SecretStorage (your OS keychain). The plaintext copy is removed on the next VS Code start, once the keychain has kept the password. Broker profiles, presets and settings keep working. If you go back to an older version later, re-enter the passwords.
- **TextMessage** now sends an SDT text payload (JMS TextMessage) and **ByteMessage** a binary attachment. Before, the two were swapped.
- The inactivity timeout can be set to 0 to never disconnect.

### Connection handling
- Lost connections (broker restart, network change, sleep) are detected: the view shows "Reconnecting", then disconnects with the reason if reconnecting fails, instead of staying "Connected".
- Subscriptions are re-applied after an automatic reconnect.
- Connect fails fast with a readable error and hints, instead of retrying a wrong password 20 times. Invalid URLs no longer leave the view stuck on "Connecting".
- Subscriptions and unsubscriptions are confirmed by the broker; failures are shown and the topic list stays accurate.
- Queue and topic endpoint consumers report binding, active, standby, rebinding and unbound states. A consumer is reset correctly after a disconnect, and "Stop Consume" no longer throws.
- Persistent publishes are counted as acknowledged or rejected by the broker, with the reason (#1).
- Editing a broker profile is picked up on the next connect; the broker cannot be changed by accident while connected.
- Inactivity disconnects show their reason, count user actions as activity, and apply setting changes immediately.
- Connections are tracked in the status bar, with notifications and a Reconnect action for unexpected disconnects.
- Broker profiles can forward loopback URLs (e.g. ws://localhost:8008) to the remote workspace through VS Code in remote windows (advanced settings, off by default).

### Fixes
- Received Text, Map, Stream and XML messages are decoded correctly (no stray header bytes or trailing NUL), and non-ASCII text is no longer corrupted.
- 64-bit integer user properties above 48 bits no longer break message delivery; out-of-range integers are rejected when publishing; Float properties are sent as doubles; negative numbers can be typed.
- Ignore topics follow Solace wildcard rules and no longer hide unrelated topics or crash the view on characters like `+` or `(`. Queue messages are never hidden.
- The message filter no longer crashes on `[` or `(`, matches user property values, and highlights the original text.
- Settings inputs can be cleared and retyped, and values are kept within valid ranges.
- Brokers, settings and presets are no longer overwritten by other views or windows. Deleting the last preset is saved.
- Presets are loaded only from the preset menu; arrow keys and the delete button no longer load presets by accident.
- Arrow, Home and End keys work in text fields, and Escape no longer collapses every section.
- An empty Reply To or Correlation ID no longer breaks publishing; "Clear Fields" also clears user properties and the message type; the priority slider shows its value.
- Opened and exported messages keep the exact payload and no longer include the internal `_extension_uid` field.
- High Contrast Light uses the light theme. Buttons work from the keyboard.
- Payload files are saved next to the workspace folder (never overwriting existing files), or opened unsaved when no folder is open.
- The webview has a Content-Security-Policy, and leaked theme listeners are cleaned up.

### New
- Browse queues without removing messages, and delete single messages.
- Temporary queues with topic subscriptions, and "create if missing" for durable endpoints.
- Request/Reply mode with reply timeout and round-trip time.
- Copy a received message to Publish, resend it, and a publish history.
- Pause/resume the message stream, a virtualized message list for large volumes, and JSON export.
- Test connection, connection details (client name, broker version, capabilities, stats), and advanced session settings.
- Passwords in SecretStorage, or asked on every connect.
- "Solace Try Me" output channel, Copy Diagnostics, Getting Started walkthrough and a command to start a local broker.
- Subscribe "Clear Fields" and recent topic suggestions (#28).
- Form state is kept when a view is reloaded, and tabs are restored after a window reload.

## [0.0.13] - 2026-10-01
- Upgraded dependencies: solclientjs 10.18.3, NextUI 2.6, framer-motion 12, lucide-react 1.x, Vite 8, ESLint 10, TypeScript 6. `npm audit` reports no vulnerabilities.
- Release workflow: Node 24, pinned @vscode/vsce, and publishing is skipped when the version is already on the Marketplace.
- The extension package no longer includes CI and development files.

## [0.0.12] - 2025-01-20
- Fixed some queue disconnection issues

## [0.0.11] - 2024-11-07
- Added compact vide mode to list of messages

## [0.0.10] - 2024-10-29
- Ignore case filtering + case sensitive meta/userProp printing

## [0.0.9] - 2024-10-22
- Fixed pasting issue for the subscribe view.

## [0.0.8] - 2024-10-22
- Added ignore topics functionality

## [0.0.7] - 2024-10-20
- Added the feature of searching and filtering messages + the option to open messages as saved files.

## [0.0.6] - 2024-10-17
- Added Settings Dialog with configurable extension settings, fixed topic issue in subscribe view disconnection.

## [0.0.5] - 2024-10-16
- Added color theme sync with VS Code, added automatic broker disconnection on inactivity, other small enhancements and bug fixes.

## [0.0.4] - 2024-10-15
- Added support to open multiple SolaceTryMe Tabs in new windows.

## [0.0.3] - 2024-10-12
- Added support for config sync across multiple windows.

## [0.0.2] - 2024-10-11
- Added JSON pretty print + Fix Ctrl+C/V/A issue + Fix modal force focus issue + Removed Max width from messages.

## [0.0.1] - 2024-10-10
- Initial release of solace-try-me-vsc-extension.