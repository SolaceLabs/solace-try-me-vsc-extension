# Subscribe to a topic

In the Subscribe section, type `try-me/>` and press **Subscribe**.

Solace wildcards:

- `*` matches exactly one level, e.g. `try-me/*/created`
- `prefix*` matches levels that start with the prefix, e.g. `try-me/order*`
- `>` as the last level matches one or more levels, e.g. `try-me/>`

Topics you add while disconnected are subscribed when you connect.
