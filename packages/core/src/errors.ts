import { z } from "zod";
export type ErrorCode =
  | "AUTHENTICATION"
  | "PERMISSION"
  | "VALIDATION"
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "NETWORK"
  | "UNCERTAIN_WRITE"
  | "API"
  | "STORAGE"
  | "LOGIN";

export class PlanktonError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PlanktonError";
  }
}

export function errorResult(error: unknown) {
  const e =
    error instanceof PlanktonError
      ? error
      : error instanceof z.ZodError
        ? new PlanktonError(
            "VALIDATION",
            "Invalid input. Check field types, lengths and required references.",
            { fields: error.issues.map((i) => i.path.join(".")) },
          )
        : new PlanktonError(
            "API",
            "Operation failed. Run plankton doctor for connection diagnostics.",
          );
  return {
    ok: false as const,
    error: {
      code: e.code,
      message: e.message,
      ...(e.details ? { details: e.details } : {}),
    },
  };
}
