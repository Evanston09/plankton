import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { PlanktonError } from "@evanston/plankton-core";

export async function installBrowser() {
  try {
    const cli = join(
      dirname(
        createRequire(import.meta.url).resolve("playwright/package.json"),
      ),
      "cli.js",
    );
    const child = spawn(process.execPath, [cli, "install", "chromium"], {
      stdio: ["ignore", 2, 2],
    });
    const [code] = await once(child, "exit");
    if (code !== 0) throw new Error();
  } catch {
    throw new PlanktonError(
      "LOGIN",
      "Chromium installation failed. Check network access and Playwright system prerequisites, or use plankton setup --manual.",
    );
  }
}

export async function ensureBrowser() {
  const { chromium } = await import("playwright");
  if (existsSync(chromium.executablePath())) return;
  console.error("Installing Chromium for browser login...");
  await installBrowser();
}
