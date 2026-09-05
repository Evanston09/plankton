# Plankton

Plankton is a TypeScript CLI that lets robotics teammates manage Planka tasks through AI agents. Favor simple, reliable behavior and clear output for both people and agents.

## Repository layout

- `packages/core/src`: API requests, schemas, reference resolution, and typed results. Keep browser, credential storage, and CLI concerns out of core.
- `packages/cli/src`: commands, output, browser login, and OS credential storage.
- `tests`: Vitest coverage using mocked API responses and CLI subprocesses.
- `skills/plankton`: agent instructions and command reference. `docs`: development, authentication, compatibility, and release guidance.

## Development workflow

- Use Node.js 22+ and the pnpm version pinned in `package.json`. Install with `pnpm install --frozen-lockfile`.
- Run `pnpm check` after code changes; it builds, tests, and typechecks both packages. Add regression coverage for bug fixes and meaningful behavior changes.
- Use `pnpm plankton --help` to exercise the checkout CLI. Run `pnpm build` after source edits before invoking it; edit source files, not generated `dist` output.
- Follow existing patterns, keep changes focused, and preserve unrelated uncommitted work. Avoid speculative abstractions and unnecessary dependencies.
