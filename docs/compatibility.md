# Compatibility and validation

The 0.2.1 CLI and core require Node.js 22+ and target the Planka 2.0.0-rc.4 API. Compatibility with other Planka versions is not established.

The automated suite covers command parsing, help and version output, compact JSON/readable output, pagination, request fields, scoped references, malformed responses, write uncertainty, setup orchestration and credential replacement. The full release check is `pnpm check`.

Live Planka operations, production SSO, native credential vaults on each supported OS, and end-to-end Codex/Claude Code behavior still require manual verification. Chromium login needs a desktop display; credential storage needs an accessible native vault. See [authentication](authentication.md).

Card searches inspect board cards and up to ten pages per archive/trash list. A `truncated` result can indicate either an output limit or an incomplete scan. Exact card-name resolution is independent of the display limit but refuses to resolve against an incomplete scan. Browse offsets apply to each current collection independently, so concurrent changes can shift results.

Malformed API reads fail instead of silently producing empty collections. A failed or malformed write response can produce `UNCERTAIN_WRITE`; the CLI never retries writes automatically. There are no multi-command transactions, deletion commands, or moves/creates into trash.
