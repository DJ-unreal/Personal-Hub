import { getWeather } from "@/lib/weather";
import { json } from "@/lib/http";

export const runtime = "nodejs";
// Cache the handler response for 15 min; the upstream fetch is cached too.
export const revalidate = 900;

// GET /api/weather
export async function GET() {
  try {
    return json(await getWeather());
  } catch (e) {
    console.error("[api] weather:", e);
    return Response.json(
      { error: "Weather is temporarily unavailable" },
      { status: 502 },
    );
  }
}
