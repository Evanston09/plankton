import {
  normalizeUrl,
  PlankaClient,
  PlanktonError,
  sessionSchema,
  type Session,
} from "@evanston/plankton-core";
import type { CredentialStore } from "./storage.js";

/** Acquire and verify a replacement before changing the saved connection. */
export async function setupConnection(
  store: CredentialStore,
  url?: string,
  options: { manual?: boolean } = {},
) {
  const old = await store.read();
  if (!url && !old?.url && !process.stdin.isTTY) {
    throw new PlanktonError(
      "VALIDATION",
      "Supply your Planka URL: plankton setup https://your-planka.example",
    );
  }
  const ask = async (prompt: string, secret = false) =>
    (await import("./prompt.js")).ask(prompt, secret);
  const target = normalizeUrl(url ?? old?.url ?? (await ask("Planka URL:")));
  const verify = (session: Session) =>
    new PlankaClient({ url: target, session }).account();
  let verified;
  if (options.manual) {
    const session = sessionSchema.parse({
      accessToken: await ask("accessToken cookie (hidden):", true),
      httpOnlyToken:
        (await ask("httpOnlyToken cookie (hidden; blank if absent):", true)) ||
        undefined,
    });
    verified = { session, account: await verify(session) };
  } else {
    await (await import("./browser.js")).ensureBrowser();
    console.error(
      "Opening browser. Complete sign-in there; Plankton will save the connection and close the window.",
    );
    verified = await (await import("./login.js")).browserLogin(target, verify);
  }
  await store.write({ url: target, session: verified.session });
  return { url: target, account: verified.account };
}
