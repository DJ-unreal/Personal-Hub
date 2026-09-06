import { requireOpenModule } from "@/lib/session";
import { isConfigured, list } from "@/lib/healthDocs";
import { isMailConfigured } from "@/lib/mailer";
import { json, serverError } from "@/lib/http";
import type { HealthDocsResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health-docs → { configured, docs }
export async function GET() {
  try {
    const guard = await requireOpenModule("health");
    if (guard instanceof Response) return guard;

    const result: HealthDocsResult = {
      configured: isConfigured(),
      mailConfigured: isMailConfigured(),
      docs: list(),
    };
    return json(result);
  } catch (e) {
    return serverError(e);
  }
}
