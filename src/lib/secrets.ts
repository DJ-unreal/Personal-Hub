import type { ProtectedModule } from "@/lib/types";

/* ---------------------------------------------------------------------
   Server-side secret access. Reads from the environment (.env.local),
   validated lazily so a missing var produces a clear error at use rather
   than a crash at import. Populate via `npm run auth:set`.
   --------------------------------------------------------------------- */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing env var ${name} — run "npm run auth:set" to configure secrets.`,
    );
  }
  return v;
}

const PASSCODE_ENV: Record<ProtectedModule, string> = {
  budget: "BUDGET_PASSCODE_HASH",
  health: "HEALTH_PASSCODE_HASH",
};

// argon2 hashes are stored base64-encoded (their raw `$...$` form is mangled
// by the dotenv variable-expansion loader). Decode back to the hash string.
function decodeHash(name: string): string {
  return Buffer.from(required(name), "base64").toString("utf8");
}

export const secrets = {
  sessionSecret: () => required("SESSION_SECRET"),
  encryptionKey: () => required("ENCRYPTION_KEY"),
  masterHash: () => decodeHash("MASTER_PASSWORD_HASH"),
  passcodeHash: (m: ProtectedModule) => decodeHash(PASSCODE_ENV[m]),
};
