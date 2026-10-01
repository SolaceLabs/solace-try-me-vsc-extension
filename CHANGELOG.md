# Change Log

All notable changes to the "solace-try-me-vsc-extension" extension will be documented in this file.

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