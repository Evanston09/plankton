import { PlanktonError } from "./errors.js";
import { normalizeUrl, sessionSchema, type Session } from "./session.js";
import { z } from "zod";

export interface ClientOptions {
  url: string;
  session: Session;
  fetch?: typeof fetch;
  timeoutMs?: number;
  debug?: (details: Record<string, unknown>) => void;
}

export class PlankaTransport {
  readonly url: string;
  private readonly session: Session;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly debug?: ClientOptions["debug"];

  constructor(options: ClientOptions) {
    this.debug = options.debug;
    this.url = normalizeUrl(options.url);
    this.session = sessionSchema.parse(options.session);
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const write = method !== "GET";
    let status: number | undefined;
    let phase = "network";
    const endpoint = path.split("?")[0];
    const started = Date.now();
    try {
      const response = await this.fetcher(`${this.url}/api/${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.session.accessToken}`,
          ...(this.session.httpOnlyToken
            ? { Cookie: `httpOnlyToken=${this.session.httpOnlyToken}` }
            : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      status = response.status;
      phase = "response";
      if (response.status === 401) {
        throw new PlanktonError(
          "AUTHENTICATION",
          "Planka session expired or invalid. Run plankton login.",
        );
      }
      if (response.status === 403) {
        throw new PlanktonError(
          "PERMISSION",
          "Planka denied this operation. Check the account’s board permissions.",
        );
      }
      if (response.status === 404) {
        throw new PlanktonError(
          "NOT_FOUND",
          "Resource not found or not accessible to this account.",
        );
      }
      if ([400, 422].includes(response.status)) {
        throw new PlanktonError(
          "VALIDATION",
          "Planka rejected the fields. Check the resource type and values.",
        );
      }
      if (!response.ok) {
        throw new PlanktonError(
          write && response.status >= 500 ? "UNCERTAIN_WRITE" : "API",
          write && response.status >= 500
            ? "Planka failed during a write. Read the resource before trying again; the change may have completed."
            : `Planka returned HTTP ${response.status}.`,
          { status: response.status },
        );
      }
      phase = "json";
      const payload = await response.json();
      phase = "schema";
      return schema.parse(payload);
    } catch (error) {
      if (error instanceof PlanktonError) {
        error.details = { ...error.details, status, endpoint, method };
        throw error;
      }
      throw new PlanktonError(
        write ? "UNCERTAIN_WRITE" : phase === "network" ? "NETWORK" : "API",
        write
          ? "The write outcome is unknown. Read the resource before retrying; do not repeat the write blindly."
          : phase === "network"
            ? "Could not reach Planka. Check the connection or timeout."
            : "Planka returned an invalid API response.",
        {
          status,
          endpoint,
          method,
          phase,
          ...(error instanceof z.ZodError
            ? { fields: error.issues.map((i) => i.path.join(".")) }
            : {}),
        },
      );
    } finally {
      this.debug?.({
        method,
        endpoint,
        status,
        phase,
        durationMs: Date.now() - started,
      });
    }
  }
}
