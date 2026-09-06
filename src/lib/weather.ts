import type { Weather, WeatherWarning } from "@/lib/types";

/* =====================================================================
   Weather — live data from Open-Meteo (keyless), fetched server-side
   (brief step 4). Location defaults to Regensburg but can be overridden
   with env vars so the user can point the hub at their own coordinates.
   ===================================================================== */

const LOCATION = {
  name: process.env.WEATHER_LOCATION ?? "Regensburg",
  lat: Number(process.env.WEATHER_LATITUDE ?? 49.0134),
  lon: Number(process.env.WEATHER_LONGITUDE ?? 12.1016),
};

// WMO weather interpretation codes → short human text.
const WMO: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm, hail",
  99: "Thunderstorm, heavy hail",
};

function describe(code: number): string {
  return WMO[code] ?? "—";
}

// Shape of the fields we request from Open-Meteo.
interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
    rain_sum?: number[];
    showers_sum?: number[];
    snowfall_sum?: number[];
  };
}

function deriveWarnings(
  currentCode: number,
  dailyCode: number,
  high: number,
  low: number,
  rainProb: number | null,
  rainMm: number,
  snowCm: number,
): WeatherWarning[] {
  const warnings: WeatherWarning[] = [];

  // Snow — snowfall accumulation or a snow weather code.
  const snowCode = [71, 73, 75, 77, 85, 86].includes(dailyCode);
  if (snowCm > 0 || snowCode) {
    warnings.push({
      kind: "snow",
      text: snowCm > 0 ? `Snow ${snowCm.toFixed(1)} cm` : "Snow expected",
    });
  }

  // Hail — WMO thunderstorm-with-hail codes.
  if ([96, 99].includes(currentCode) || [96, 99].includes(dailyCode)) {
    warnings.push({ kind: "hail", text: "Hail risk" });
  }

  // Rain — high probability or measurable rain (skip if it's really snow).
  const rainCode = [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(dailyCode);
  if (!snowCode && ((rainProb != null && rainProb >= 40) || rainMm >= 1 || rainCode)) {
    warnings.push({
      kind: "rain",
      text: rainProb != null ? `Rain likely (${rainProb}%)` : "Rain expected",
    });
  }

  // Temperature extremes.
  if (low <= 0) warnings.push({ kind: "cold", text: `Frost ${low}°C` });
  else if (low <= 4) warnings.push({ kind: "cold", text: `Low ${low}°C` });
  if (high >= 30) warnings.push({ kind: "heat", text: `Heat ${high}°C` });

  return warnings;
}

export async function getWeather(): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LOCATION.lat}&longitude=${LOCATION.lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,rain_sum,showers_sum,snowfall_sum` +
    `&timezone=auto&forecast_days=1`;

  // Cache the upstream response for 15 min — Open-Meteo updates roughly that often.
  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
  const data = (await res.json()) as OpenMeteoResponse;

  const cur = data.current ?? {};
  const daily = data.daily ?? {};
  const currentCode = cur.weather_code ?? 0;
  const dailyCode = daily.weather_code?.[0] ?? currentCode;
  const high = Math.round(daily.temperature_2m_max?.[0] ?? cur.temperature_2m ?? 0);
  const low = Math.round(daily.temperature_2m_min?.[0] ?? cur.temperature_2m ?? 0);
  const rainProb = daily.precipitation_probability_max?.[0] ?? null;
  const rainMm = (daily.rain_sum?.[0] ?? 0) + (daily.showers_sum?.[0] ?? 0);
  const snowCm = daily.snowfall_sum?.[0] ?? 0;

  return {
    location: LOCATION.name,
    temp: Math.round(cur.temperature_2m ?? 0),
    feelsLike: Math.round(cur.apparent_temperature ?? cur.temperature_2m ?? 0),
    description: describe(currentCode),
    wind: Math.round(cur.wind_speed_10m ?? 0),
    high,
    low,
    warnings: deriveWarnings(
      currentCode,
      dailyCode,
      high,
      low,
      rainProb,
      rainMm,
      snowCm,
    ),
    updatedAt: Date.now(),
  };
}
