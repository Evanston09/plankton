# Plankton

View and update your robotics team's Planka boards through a CLI and explicitly invoked skills for Codex and Claude Code. Browse boards, find and move cards, edit descriptions, and manage checklists.

The full skill instructions load only when you invoke the skill. Once loaded, your agent can use the CLI for relevant follow-up requests. Codex retains small discovery metadata; Claude Code's explicit-only setting also hides the description from automatic discovery. No background integration process starts with your assistant.

## Install

Requires **Node.js 22+** and a Planka account. The API target is **Planka 2.0.0-rc.4**. Install the CLI from npm:

```sh
npm install --global @evanston/plankton@latest
plankton --version
plankton setup https://your-planka.example
```

Setup opens a browser for normal sign-in, including SSO, and saves the connection in your OS credential vault. With a URL supplied, there are no terminal questions, so your agent can run setup and wait while you sign in. Chromium is downloaded on first use if needed. See [authentication help](docs/authentication.md).

Skills expect `plankton` on the assistant's PATH. npm installation supplies the CLI; skill installation is a separate step. See [development](docs/development.md) to run from source and [releasing](docs/releasing.md) for the npm release process.

## Add the skill

Install the [Plankton skill](skills/plankton/SKILL.md) from GitHub using the [skills CLI](https://www.skills.sh/docs):

```sh
npx skills add Evanston09/plankton --skill plankton --agent codex claude-code
```

Select either agent with `--agent codex` or `--agent claude-code`, or use both as shown. Add `--global` to make the skill available across projects. From a local checkout, replace `Evanston09/plankton` with `.`.

Invoke **`$plankton`** in Codex or **`/plankton`** in Claude Code. Skill installation supplies the agent instructions; the `plankton` CLI must also be installed and available on the assistant's PATH.

Try: “Find the intake card on the Robot board and move it to In Progress.” After the explicit invocation, follow-up requests can use the loaded instructions without invoking the skill for each operation. Your assistant's normal execution permissions still apply.

## Use the CLI directly

```sh
plankton boards list
plankton cards find --board Robot --query intake --json
plankton cards get 123 --json
plankton cards move 123 --list "In Progress" --json
plankton cards edit 123 --description-file notes.md --json
plankton tasks complete 456 --card 123 --checklist 789 --json
```

Readable output is the default. `--json` gives compact structured results. Lists/searches omit descriptions; `cards get` reads details. The agent can use IDs and returned match details to resolve your intent, asking you when necessary. Each command performs one operation; an agent can combine commands to complete a request.

See the [command reference](docs/cli.md) for all operations, pagination, stdin input, and errors. Deletion is not supported.

```sh
plankton doctor --json   # Check your connection
plankton login          # Sign in again; reuse the saved URL
plankton logout         # Remove local credentials
```

[Compatibility and testing limits](docs/compatibility.md) · [TypeScript library](packages/core) · [MIT license](LICENSE)
