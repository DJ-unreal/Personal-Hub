import { listItems } from "@/lib/repos";
import { requireAuth } from "@/lib/session";
import { badRequest, json, notFound, readJson, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/list-items/:id   { done?, text? }
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/list-items/[id]">,
) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const { id } = await ctx.params;
    const body = await readJson<{ done?: unknown; text?: unknown }>(request);
    if (!body) return badRequest("Invalid JSON body");

    const patch: { done?: boolean; text?: string } = {};
    if (body.done !== undefined) {
      if (typeof body.done !== "boolean") return badRequest("done must be a boolean");
      patch.done = body.done;
    }
    if (body.text !== undefined) {
      if (typeof body.text !== "string" || !body.text.trim())
        return badRequest("text must be a non-empty string");
      patch.text = body.text.trim();
    }
    if (patch.done === undefined && patch.text === undefined)
      return badRequest("nothing to update");

    const updated = listItems.update(id, patch);
    return updated ? json(updated) : notFound("Item not found");
  } catch (e) {
    return serverError(e);
  }
}

// DELETE /api/list-items/:id
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/list-items/[id]">,
) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const { id } = await ctx.params;
    return listItems.remove(id)
      ? json({ ok: true })
      : notFound("Item not found");
  } catch (e) {
    return serverError(e);
  }
}
