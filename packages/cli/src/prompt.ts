import { input, password } from "@inquirer/prompts";
import { PlanktonError } from "@evanston/plankton-core";

export async function ask(prompt: string, secret = false) {
  if (!process.stdin.isTTY) {
    throw new PlanktonError(
      "VALIDATION",
      "Run setup/login interactively in a terminal. Never pass credentials as command arguments.",
    );
  }
  return (
    await (secret ? password : input)(
      { message: prompt, ...(secret ? { mask: "*" } : {}) },
      { output: process.stderr },
    )
  ).trim();
}
