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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const area = (searchParams.get("area") || "").replace(/\s+area$/i, "").trim();

    if (q.length < 2) {
      return NextResponse.json({ places: [] });
    }

    const queryText =
      area && !q.toLowerCase().includes(area.toLowerCase()) ? `${q}, ${area}, FL` : `${q}, FL`;

    // Bounding box covering Southwest Florida (Bradenton/Sarasota down to Naples)
    const params = new URLSearchParams({
      q: queryText,
      format: "jsonv2",
      addressdetails: "1",
      limit: "6",
      countrycodes: "us",
      viewbox: "-82.85,27.65,-81.45,25.95",
      bounded: "1",
    });

    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "User-Agent": "CoastalDuskSWFL/1.0 (swfl-dating-mvp)",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ places: [] });
    }

    const items = (await res.json()) as NominatimItem[];

    const places = items.map((item) => {
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

      return {
        id: String(item.place_id),
        name: primaryName,
        city,
        subtitle,
        label,
        lat: Number(item.lat),
        lng: Number(item.lon),
      };
    });

    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ places: [] });
  }
}