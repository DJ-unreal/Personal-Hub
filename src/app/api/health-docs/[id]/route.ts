import { readFileSync } from "node:fs";
import { requireOpenModule } from "@/lib/session";
import { contentTypeFor, resolveDoc } from "@/lib/healthDocs";
import { notFound, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 5987 filename so umlauts/spaces survive the header. */
function dispositionHeader(
  disposition: "inline" | "attachment",
  filename: string,
) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// GET /api/health-docs/:id — stream the document itself.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/health-docs/[id]">,
) {
  try {
    const guard = await requireOpenModule("health");
    if (guard instanceof Response) return guard;

    const { id } = await ctx.params;
    const doc = resolveDoc(id);
    if (!doc) return notFound("Document not found");

    const { type, disposition } = contentTypeFor(doc.ext);
    const body = readFileSync(doc.filePath);

    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": dispositionHeader(disposition, doc.filename),
        // Protected-tier data: never cached by shared caches.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return serverError(e);
  }
}
