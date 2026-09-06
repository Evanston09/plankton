import { setTimeout as delay } from "node:timers/promises";
import {
  type PlankaClient,
  PlanktonError,
  normalizeUrl,
  sessionSchema,
  type Session,
} from "@evanston/plankton-core";
import type { Cookie } from "playwright";

export function sessionFromCookies(
  cookies: Pick<Cookie, "name" | "value">[],
): Session | undefined {
  const accessToken = cookies.find((c) => c.name === "accessToken")?.value;
  if (!accessToken) {
    return undefined;
  }
  const httpOnlyToken = cookies.find((c) => c.name === "httpOnlyToken")?.value;
  const result = sessionSchema.safeParse({
    accessToken,
    ...(httpOnlyToken ? { httpOnlyToken } : {}),
  });
  return result.success ? result.data : undefined;
}

export async function browserLogin(
  value: string,
  verify: (session: Session) => ReturnType<PlankaClient["account"]>,
  timeoutMs = 300000,
) {
  const url = normalizeUrl(value);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: false }).catch(() => {
    throw new PlanktonError(
      "LOGIN",
      "Could not open Chromium. Run plankton install-browser, then retry with a desktop display available; or use plankton login --manual.",
    );
  });
  let verified = false;
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const deadline = Date.now() + timeoutMs;
    let lastAttempt = "";
    while (Date.now() < deadline && browser.isConnected() && !page.isClosed()) {
      // Playwright can read HttpOnly cookies from its isolated browser context.
      const session = sessionFromCookies(
        await context.cookies(`${url}/api/users/me`),
      );
      if (session && JSON.stringify(session) !== lastAttempt) {
        lastAttempt = JSON.stringify(session);
        try {
          const account = await verify(session);
          verified = true;
          return { session, account };
        } catch (e) {
          if (!(e instanceof PlanktonError) || e.code !== "AUTHENTICATION") {
            throw e;
          }
        }
      }
      await delay(500);
    }
    throw new PlanktonError(
      "LOGIN",
      "Login was closed or timed out. Retry plankton login or use plankton login --manual.",
    );
  } catch (e) {
    if (e instanceof PlanktonError) {
      throw e;
    }
    throw new PlanktonError(
      "LOGIN",
      "Browser login failed. Retry or use plankton login --manual.",
    );
  } finally {
    try {
      await browser.close();
    } catch {
      // Preserve the original failure; never expose a raw browser error.
      if (verified)
        throw new PlanktonError(
          "LOGIN",
          "Could not close the login browser. Close it and retry login.",
        );
    }
  }
}
