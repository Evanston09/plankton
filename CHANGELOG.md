# Changelog

## 0.2.0 — CLI release

- Add the standalone CLI in `packages/cli` for browsing and updating Planka boards, cards and checklists.
- Add compact readable/JSON output, bounded collections, contextual search matches, description file/stdin input and current-board moves.
- Preserve existing Planka operations and credential vault storage. Browser setup/login can run without terminal prompts when the URL is supplied or saved.
- Distribute one standalone skill in `skills/plankton`, installable with the skills CLI.
- Make Codex and Claude Code skills explicitly invoked, with concise instructions and no registered server.
- Add command, setup and failure-recovery tests. Live Planka, SSO and assistant validation remain pending.
- Validate response resources and consumed collections at the request boundary; keep malformed write outcomes uncertain.
- Add typed operation results and explicit collection pagination without rewriting search paging metadata.
- Resolve exact card names independently of display search limits while rejecting incomplete scans.
- Publish CLI and core packages together as 0.2.0; add npm installation, authentication, development and release guides.

## 0.1.0

Initial Planka core, MCP integration, browser login, credential storage and agent integrations. See the release notes for the original validation record.
