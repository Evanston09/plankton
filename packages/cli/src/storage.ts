import { z } from "zod";
import {
  normalizeUrl,
  PlankaClient,
  PlanktonError,
  sessionSchema,
  type Session,
} from "@evanston/plankton-core";
const connectionSchema = z
  .object({ url: z.string(), session: sessionSchema })
  .strict();
export type Connection = z.infer<typeof connectionSchema>;

export interface CredentialStore {
  read(): Promise<Connection | undefined>;
  write(connection: Connection): Promise<void>;
  clear(): Promise<void>;
}

export class KeyringStore implements CredentialStore {
  private async entry() {
    try {
      const { AsyncEntry } = await import("@napi-rs/keyring");
      return new AsyncEntry("plankton", "active-connection");
    } catch {
      throw new PlanktonError(
        "STORAGE",
        "OS credential vault unavailable. On Linux, install and unlock a Secret Service keyring; on macOS/Windows, check your login credential vault.",
      );
    }
  }

  async read() {
    try {
      const value = await (await this.entry()).getPassword();
      return value ? connectionSchema.parse(JSON.parse(value)) : undefined;
    } catch (e) {
      if (e instanceof PlanktonError) {
        throw e;
      }
      throw new PlanktonError(
        "STORAGE",
        "Cannot read the OS credential vault. Unlock it and run plankton login.",
      );
    }
  }

  async write(connection: Connection) {
    try {
      await (
        await this.entry()
      ).setPassword(JSON.stringify(connectionSchema.parse(connection)));
    } catch {
      throw new PlanktonError(
        "STORAGE",
        "Cannot save the connection to the OS credential vault. Unlock it and retry login. No plaintext fallback is used.",
      );
    }
  }

  async clear() {
    try {
      await (await this.entry()).deleteCredential();
    } catch {
      throw new PlanktonError(
        "STORAGE",
        "Cannot remove the local credential. Check the OS credential vault.",
      );
    }
  }
}

export async function connectedClient(store: CredentialStore) {
  const connection = await store.read();
  if (!connection) {
    throw new PlanktonError(
      "AUTHENTICATION",
      "No active connection. Run plankton setup.",
    );
  }
  return new PlankaClient(connection);
}

export async function saveValidatedConnection(
  store: CredentialStore,
  url: string,
  session: Session,
) {
  const connection = {
    url: normalizeUrl(url),
    session: sessionSchema.parse(session),
  };
  const account = await new PlankaClient(connection).account();
  await store.write(connection);
  return account;
}
