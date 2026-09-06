import { macros } from "@/lib/repos";
import { requireAuth } from "@/lib/session";
import { json, notFound, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/macros/:id — remove a logged entry
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/macros/[id]">,
) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const { id } = await ctx.params;
    return macros.removeEntry(id)
      ? json({ ok: true })
      : notFound("Entry not found");
  } catch (e) {
    return serverError(e);
  }
}
