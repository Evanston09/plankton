# Authentication and recovery

Install with `npm install --global @evanston/plankton@latest`, then run:

```sh
plankton setup https://your-planka.example
plankton doctor --json
```

Run setup in your own terminal before using the agent. Setup downloads Chromium if it is missing and opens a separate browser window that does not share your usual browser's sign-in. You will need to sign into Planka again, including Google or your other SSO provider when applicable. Plankton validates the session, saves it in your native OS credential vault, and closes the window. Browser sign-in waits up to five minutes. Production SSO compatibility still needs live verification.

`plankton login` reuses the saved URL. Ordinary board/card commands call the API without opening a browser.

Use HTTPS for remote instances; HTTP is accepted only for localhost, 127.0.0.1 and ::1. Include any deployment subpath in the URL. Do not include credentials, a query or a fragment.

## Browser and credential vault requirements

- Browser login needs a desktop display. `plankton install-browser` installs Chromium ahead of time; install any Playwright system prerequisites reported by Chromium if launch fails.
- Linux needs an installed, running and unlocked Secret Service provider, such as GNOME Keyring. A headless shell, container or WSL session may not have access to a desktop vault or display.
- macOS and Windows use their native credential vaults. Run the CLI under the same OS account and environment as the assistant that will use it.

Credentials are stored as one active connection in the OS vault. No plaintext fallback is used. A replacement connection is validated before it overwrites the saved connection.

## Manual login

To reuse a session from your usual browser without signing in again, or if browser login is unavailable, run this in your own interactive terminal:

```sh
plankton login https://your-planka.example --manual
```

The prompts display asterisks as you type or paste. They accept the `accessToken` cookie and, when present, the `httpOnlyToken` cookie from your signed-in Planka browser session. Leave the second prompt blank if that cookie is absent. Manual login still requires an available OS credential vault. Never paste cookies into assistant chat or pass them as command arguments.

Follow the [manual setup instructions](../README.md#manual-setup-with-cookies) to find and copy these values in your browser. `setup --manual` and `login --manual` use the same process and do not download or open a browser.

## Recovery

Run `plankton doctor` to verify vault access and the current account. On an expired session, run `plankton login`. For `STORAGE` errors, unlock or restore access to the vault before retrying.

`plankton logout` removes the saved local connection. It does not revoke the server session; revoke that separately in Planka settings if needed. See the [CLI reference](cli.md#setup-and-recovery) for other error codes and recovery behavior.
