![Plankton CLI demo](docs/demo.gif)

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

2. Connect to Planka in your own terminal:

   ```sh
   plankton setup https://your-planka.example
   ```

   Replace the example URL with your team's Planka address. Setup opens a separate browser that does not share your usual browser's sign-in. You will need to sign into Planka again, including Google or your other SSO provider if you use one. Chromium may be downloaded the first time.

   To reuse an existing Planka login instead, follow [manual setup with cookies](#manual-setup-with-cookies) below. Both methods save the connection in your operating system's credential vault.

3. Open your agent and ask for what you need:

   - Codex: `$plankton Find the intake card on the Robot board and move it to In Progress.`
   - Claude Code: `/plankton Find the intake card on the Robot board and move it to In Progress.`

   Then continue with requests such as:

   > Add a checklist named Release to the launch card.

   > Show me the incomplete tasks on the motor controller card.

You only need to invoke Plankton once per conversation. After that, continue asking normally.

## Manual setup with cookies

Use this option if you are already signed into Planka in your usual browser and want to avoid signing in again. Cookies act as credentials: paste them only into Plankton's hidden terminal prompts, never into agent chat or command arguments.

1. Open your team's Planka site in your usual browser and confirm you can see your boards.
2. Right-click the page and choose **Inspect** to open developer tools. In Chrome, select **Application** (it may be under the **»** overflow menu), then expand **Cookies** under **Storage** and select your Planka site's address. In Firefox, select the **Storage** tab, expand **Cookies**, and select your Planka site. See the [Chrome](https://developer.chrome.com/docs/devtools/application/cookies/) or [Firefox](https://firefox-source-docs.mozilla.org/devtools-user/storage_inspector/cookies/) cookie guide for screenshots and details.
3. In your own terminal, run:

   ```sh
   plankton setup https://your-planka.example --manual
   ```

4. In the browser's cookie table, find the row named `accessToken`. Copy its complete **Value**, paste it into the `accessToken cookie (hidden):` terminal prompt, and press Enter. Copy only the value, without the cookie name, surrounding quotes, or `accessToken=` prefix. Asterisks appear as you type or paste to show that your input was received while keeping the cookie value hidden.
5. If the cookie table also contains `httpOnlyToken`, copy its value into the second prompt and press Enter. If that cookie is absent, leave the prompt blank and press Enter. Use the cookies from your Planka site, not your Google account. If `accessToken` is missing, confirm you are signed into Planka, reload the page, and check the selected site again.
6. After setup succeeds, run `plankton doctor` to check the connection. You can then use your agent as shown above.

Manual setup does not download or open another browser. When the saved session expires, run setup again using either method.

## Direct CLI use

The skill uses the `plankton` CLI behind the scenes. You can also run it yourself:

```sh
plankton boards list
plankton cards find --board Robot --query intake
plankton cards move 123 --list "In Progress"
plankton doctor
```

Results use tables for human-readable collections and item details, with wide collections stacked to fit the terminal. Run `plankton --help` to explore commands, or use `--json` for structured output for agents and scripts. See the [CLI reference](docs/cli.md) for every command.

## Help

- [Authentication and sign-in issues](docs/authentication.md)
- [Compatibility and testing limits](docs/compatibility.md)
- [Development setup](docs/development.md)
- [Core TypeScript library](packages/core)

Plankton was developed using copius help from GPT-6 Astra

[MIT license](LICENSE)
