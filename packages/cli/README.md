# @evanston/plankton

Planka CLI for humans and explicitly invoked agent skills. Node.js 22+; Planka API target 2.0.0-rc.4. This CLI pivot is not published yet.

```sh
plankton setup https://your-planka.example
plankton boards list --json
plankton cards find --board Robot --query intake --json
plankton cards get 123 --json
plankton cards move 123 --list "In Progress" --json
plankton cards edit 123 --description-file notes.md --json
plankton --help
```

Command groups: projects, boards, lists, cards, checklists, tasks. Use `<group> <command> --help` for required inputs and options. Text output is the default; `--json` prints `{ok:true,data}` to stdout or `{ok:false,error}` to stderr with exit code 1. Lists default to 25 rows; follow `paging.<collection>.nextOffset` with `--offset`. Truncated title searches require narrowing or a known ID/link. Card details are fetched with `cards get`; writes return compact summaries.

Setup/login can run without terminal prompts when a URL is supplied or saved. The user completes browser sign-in, including SSO. Credentials stay in the native OS vault. Linux requires an unlocked Secret Service provider. Manual cookie import (`login --manual`) is for a user's interactive terminal. Ordinary commands use the API and never open a browser. `doctor` checks the connection; `logout` removes local credentials.

The shared Codex and Claude Code skill lives in `skills/plankton` in the [repository](https://github.com/Evanston09/plankton). Install from a checkout with `npx skills add . --skill plankton --agent codex claude-code`; see the repository README for installation details. The instructions load only on explicit invocation; no integration server is needed. The CLI must be on the assistant's PATH. See the repository's `docs/cli.md` for the output contract and examples.

No deletion command. Each invocation performs one operation; agents can compose calls. After `UNCERTAIN_WRITE`, inspect current state before retrying. Live Planka, production SSO and assistant behavior still require verification.
