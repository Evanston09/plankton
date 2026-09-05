# Plankton

Give Codex or Claude Code access to your team's [Planka](https://planka.app/) boards. Ask your agent to find cards, move work, update descriptions, and manage checklists in plain language.

## Quick start

Requires [Node.js 22+](https://nodejs.org/) and a Planka account.

1. Install Plankton and the agent skill:

   ```sh
   npm install --global @evanston/plankton@latest
   npx skills add https://github.com/Evanston09/plankton
   ```

   For the agent skill, select **Global** if you want to use Plankton anywhere, then select the agents you want to add it to.

2. Open your agent and connect to Planka:

   - Codex: `$plankton Connect to https://your-planka.example`
   - Claude Code: `/plankton Connect to https://your-planka.example`

   Plankton opens a browser window for sign-in, including SSO, and stores the connection in your operating system's credential vault. Chromium may be downloaded the first time. Your password is never entered in chat.

3. Ask for what you need:

   > Find the intake card on the Robot board and move it to In Progress.

   > Add a checklist named Release to the launch card.

   > Show me the incomplete tasks on the motor controller card.

You only need to invoke Plankton once per conversation. After that, continue asking normally.

## Direct CLI use

The skill uses the `plankton` CLI behind the scenes. You can also run it yourself:

```sh
plankton boards list
plankton cards find --board Robot --query intake
plankton cards move 123 --list "In Progress"
plankton doctor
```

Run `plankton --help` to explore commands, or use `--json` for structured output. See the [CLI reference](docs/cli.md) for every command.

## Help

- [Authentication and sign-in issues](docs/authentication.md)
- [Compatibility and testing limits](docs/compatibility.md)
- [Development setup](docs/development.md)
- [Core TypeScript library](packages/core)

Plankton targets Planka 2.0.0-rc.4. Deletion is not supported.

[MIT license](LICENSE)
