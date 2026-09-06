import { links } from "@/lib/repos";
import { requireAuth } from "@/lib/session";
import { badRequest, json, readJson, nonEmptyString, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/links
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    return json(links.all());
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/links   { label, url }
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const body = await readJson<{ label?: unknown; url?: unknown }>(request);
    if (!body) return badRequest("Invalid JSON body");

    const label = nonEmptyString(body.label);
    if (!label) return badRequest("label is required");

    let url = nonEmptyString(body.url);
    if (!url) return badRequest("url is required");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    return json(links.create(label, url), 201);
  } catch (e) {
    return serverError(e);
  }
}
