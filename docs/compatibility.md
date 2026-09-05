# Compatibility and validation

The 0.3.2 CLI and core require Node.js 22+ and target the Planka 2.0.0-rc.4 API. Compatibility with other Planka versions is not established.

The automated suite covers command parsing, help and version output, compact JSON/readable output, pagination, request fields, scoped references, malformed responses, write uncertainty, setup orchestration and credential replacement. The full release check is `pnpm check`.

Live Planka operations, production SSO, native credential vaults on each supported OS, and end-to-end Codex/Claude Code behavior still require manual verification. Chromium login needs a desktop display; credential storage needs an accessible native vault. See [authentication](authentication.md).

Card searches inspect board cards; explicitly selected archive/trash lists fetch up to ten pages. A `truncated` result can indicate either an output limit or an incomplete scan; `complete` distinguishes scan completeness, and `paging.items.nextOffset` advances through discovered matches. Exact card-name resolution is independent of the display limit but refuses to resolve against an incomplete scan. Browse offsets apply to each current collection independently, so concurrent changes can shift results.

Malformed API reads fail instead of silently producing empty collections. A failed or malformed write response can produce `UNCERTAIN_WRITE`; the CLI never retries writes automatically. There are no multi-command transactions or moves/creates into trash. Explicit delete commands permanently remove cards, checklists, or tasks; archive moves cards to the board archive.

Archive/trash list names and positions may be null in the target API. These values are accepted without weakening ID and collection validation. Card types remain `project` and `story`, matching the bundled server model.

Board-wide card listing, search, and name resolution cover active/closed lists from the board response. Archive and trash are excluded unless selected explicitly with `cards list/find --list <id>`. Explicit endless-list scans remain bounded and report errors rather than silently skipping failed pages. `complete` describes the selected scope. Use card IDs or links to access archived/trashed cards directly.
