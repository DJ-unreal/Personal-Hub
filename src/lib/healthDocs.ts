import { readdirSync, realpathSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import type { HealthDoc } from "@/lib/types";

/* =====================================================================
   Health documents — files live on a disk volume the user owns and are
   NEVER copied into the database (brief: "the files never leave the
   user's own hardware"). The folder is read live, so files added or
   renamed outside the app show up immediately with no re-index step.

   Everything here is reached only through routes guarded by the health
   module passcode (see requireOpenModule("health")).
   ===================================================================== */

/** Configured document root, or null when unset. */
function root(): string | null {
  const dir = process.env.HEALTH_DOCS_DIR;
  return dir && dir.trim() ? dir.trim() : null;
}

export function isConfigured(): boolean {
  const r = root();
  if (!r) return false;
  try {
    return existsSync(r) && statSync(r).isDirectory();
  } catch {
    return false;
  }
}

/* Ids are opaque handles, never raw paths: base64url of the filename. */
const encodeId = (filename: string) =>
  Buffer.from(filename, "utf8").toString("base64url");
const decodeId = (id: string) =>
  Buffer.from(id, "base64url").toString("utf8");

export function list(): HealthDoc[] {
  const r = root();
  if (!r || !isConfigured()) return [];

  return readdirSync(r, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => {
      const st = statSync(path.join(r, e.name));
      const ext = path.extname(e.name).slice(1).toLowerCase();
      return {
        id: encodeId(e.name),
        name: path.basename(e.name, path.extname(e.name)),
        ext,
        size: st.size,
        modified: st.mtimeMs,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve an id to a real file inside the document root.
 *
 * Defence in depth against path traversal:
 *  1. the decoded name must be a bare filename (no separators, no "..")
 *  2. the resolved path must sit inside the resolved root
 *  3. symlinks are resolved first, so a link pointing outside is rejected
 * Returns null on any failure — callers surface that as a 404.
 */
export function resolveDoc(
  id: string,
): { filePath: string; filename: string; ext: string } | null {
  const r = root();
  if (!r || !isConfigured()) return null;

  let filename: string;
  try {
    filename = decodeId(id);
  } catch {
    return null;
  }
  if (!filename || filename !== path.basename(filename)) return null;
  if (filename === "." || filename === "..") return null;

  const candidate = path.resolve(r, filename);
  const rootResolved = path.resolve(r);
  if (
    candidate !== path.join(rootResolved, filename) ||
    !candidate.startsWith(rootResolved + path.sep)
  ) {
    return null;
  }

  try {
    // Resolve symlinks and re-check containment.
    const realRoot = realpathSync(rootResolved);
    const realFile = realpathSync(candidate);
    if (!realFile.startsWith(realRoot + path.sep)) return null;
    if (!statSync(realFile).isFile()) return null;
    return {
      filePath: realFile,
      filename,
      ext: path.extname(filename).slice(1).toLowerCase(),
    };
  } catch {
    return null;
  }
}

/* Only well-known, non-executable types are shown inline in the browser.
   Anything else downloads, so e.g. a stray .html in the folder can never
   run script against this app's origin. */
const INLINE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain; charset=utf-8",
};

export function contentTypeFor(ext: string): {
  type: string;
  disposition: "inline" | "attachment";
} {
  const type = INLINE_TYPES[ext];
  return type
    ? { type, disposition: "inline" }
    : { type: "application/octet-stream", disposition: "attachment" };
}
