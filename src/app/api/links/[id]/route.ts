import { links } from "@/lib/repos";
import { requireAuth } from "@/lib/session";
import { json, notFound, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/links/:id
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/links/[id]">,
) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const { id } = await ctx.params;
    return links.remove(id) ? json({ ok: true }) : notFound("Link not found");
  } catch (e) {
    return serverError(e);
  }
}
