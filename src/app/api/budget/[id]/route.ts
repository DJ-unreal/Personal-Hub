import { budget } from "@/lib/repos";
import { requireOpenModule } from "@/lib/session";
import { json, notFound, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/budget/:id
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/budget/[id]">,
) {
  try {
    const guard = await requireOpenModule("budget");
    if (guard instanceof Response) return guard;
    const { id } = await ctx.params;
    return budget.remove(id) ? json({ ok: true }) : notFound("Line not found");
  } catch (e) {
    return serverError(e);
  }
}
