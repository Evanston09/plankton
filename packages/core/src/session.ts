import { z } from "zod";
import { PlanktonError } from "./errors.js";
const token = z
  .string()
  .min(1)
  .max(16384)
  .regex(/^[A-Za-z0-9._~+%/=-]+$/);
export const sessionSchema = z
  .object({ accessToken: token, httpOnlyToken: token.optional() })
  .strict();
export type Session = z.infer<typeof sessionSchema>;

export function normalizeUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PlanktonError("VALIDATION", "Enter an absolute Planka URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new PlanktonError(
      "VALIDATION",
      "Use an HTTP(S) Planka URL without credentials, query or fragment.",
    );
  }
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new PlanktonError(
      "VALIDATION",
      "Use HTTPS for remote Planka instances.",
    );
  }
  return url.href.replace(/\/+$/, "");
}
