# Changelog

## Unreleased — CLI pivot

- Replace the MCP server, configuration commands, protocol tests and SDK dependencies with a full CLI in `packages/cli`.
- Add compact readable/JSON output, bounded collections, contextual search matches, description file/stdin input and current-board moves.
- Preserve existing Planka operations and credential vault storage. Browser setup/login can run without terminal prompts when the URL is supplied or saved.
- Distribute one standalone skill in `skills/plankton`, installable with the skills CLI.
- Make Codex and Claude Code skills explicitly invoked, with concise instructions and no registered server.
- Add command, setup and failure-recovery tests. Live Planka, SSO and assistant validation remain pending.

## 0.1.0

Initial Planka core, MCP integration, browser login, credential storage and agent integrations. See the release notes for the original validation record.
