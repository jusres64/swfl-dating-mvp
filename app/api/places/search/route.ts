import { NextRequest, NextResponse } from "next/server";

interface NominatimItem {
  place_id: number;
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    county?: string;
    state?: string;
  };
}

async function queryNominatim(query: string, bounded: boolean): Promise<NominatimItem[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "8",
    countrycodes: "us",
    // Full SWFL bounding box: Bradenton/Sarasota -> Charlotte/Punta Gorda -> Lee -> Collier/Naples
    viewbox: "-82.95,27.75,-81.30,25.80",
  });
  if (bounded) {
    params.set("bounded", "1");
  }

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      "User-Agent": "CoastalDuskSWFL/1.0 (swfl-dating-mvp)",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) return [];
  return (await res.json()) as NominatimItem[];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    if (q.length < 2) {
      return NextResponse.json({ places: [] });
    }

    const queryWithState = /\b(fl|florida)\b/i.test(q) ? q : `${q}, Florida`;

    // First search strictly inside Southwest Florida
    let items = await queryNominatim(queryWithState, true);

    // Fallback to Florida-wide biased to SWFL if a newer/smaller spot wasn't inside the strict box
    if (items.length === 0) {
      items = await queryNominatim(queryWithState, false);
    }

    const seen = new Set<string>();
    const places = [];

    for (const item of items) {
      const city =
        item.address?.city ||
        item.address?.town ||
        item.address?.village ||
        item.address?.hamlet ||
        item.address?.county ||
        "Southwest Florida";
      const primaryName = item.name?.trim() || item.display_name.split(",")[0].trim();
      const subtitleParts = [item.address?.road, city, "FL"].filter(Boolean);
      const subtitle = subtitleParts.join(", ");
      const label = primaryName.toLowerCase().includes(city.toLowerCase())
        ? primaryName
        : `${primaryName} (${city})`;

      const dedupeKey = `${primaryName.toLowerCase()}|${subtitle.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      places.push({
        id: String(item.place_id),
        name: primaryName,
        city,
        subtitle,
        label,
        lat: Number(item.lat),
        lng: Number(item.lon),
      });
    }

    return NextResponse.json({ places: places.slice(0, 6) });
  } catch {
    return NextResponse.json({ places: [] });
  }
}