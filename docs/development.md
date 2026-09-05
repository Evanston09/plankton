# Development

End users can install the published CLI with `npm install --global @evanston/plankton@latest`. Working on the source requires Node.js 22+ and pnpm 11.25.0.

```sh
git clone https://github.com/Evanston09/plankton.git
cd plankton
pnpm install --frozen-lockfile
pnpm check
pnpm plankton --help
```

`pnpm check` builds both packages, runs the tests, and typechecks both packages. `pnpm build` refreshes compiled output after edits. The CLI entry point is `packages/cli/dist/cli.js`; `pnpm plankton` runs it from the checkout.

## Use the source build with an assistant

Skills invoke `plankton` by name. To expose the source build, add a directory containing this wrapper to your PATH, replacing the checkout path:

```sh
#!/bin/sh
exec node /absolute/path/to/plankton/packages/cli/dist/cli.js "$@"
```

Name the wrapper `plankton`, make it executable, and put its directory ahead of any global npm installation on the assistant's PATH. Run `plankton --version` from that environment to confirm it is available. Rebuild after source changes.

Install the skill from the checkout:

```sh
npx skills add . --skill plankton --agent codex claude-code
```

The core package owns API requests, validation, reference resolution and typed operation results. The CLI package owns commands, output, browser sign-in and credential storage. Tests use mocked responses for operations and subprocesses for executable behavior; they do not establish live Planka or SSO compatibility.

See [releasing](releasing.md) for package preparation and [compatibility](compatibility.md) for validation limits.
