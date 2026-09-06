import { budget } from "@/lib/repos";
import type { BudgetType } from "@/lib/types";
import { requireOpenModule } from "@/lib/session";
import { badRequest, json, readJson, nonEmptyString, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/budget
export async function GET() {
  try {
    const guard = await requireOpenModule("budget");
    if (guard instanceof Response) return guard;
    return json(budget.all());
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/budget   { label, amount, type }
export async function POST(request: Request) {
  try {
    const guard = await requireOpenModule("budget");
    if (guard instanceof Response) return guard;
    const body = await readJson<{
      label?: unknown;
      amount?: unknown;
      type?: unknown;
    }>(request);
    if (!body) return badRequest("Invalid JSON body");

    const label = nonEmptyString(body.label);
    if (!label) return badRequest("label is required");

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return badRequest("amount must be a positive number");

    if (body.type !== "income" && body.type !== "expense")
      return badRequest("type must be 'income' or 'expense'");

    return json(budget.create(label, amount, body.type as BudgetType), 201);
  } catch (e) {
    return serverError(e);
  }
}
