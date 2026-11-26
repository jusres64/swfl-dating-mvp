import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSession, PROFILE_SELECT_FIELDS } from "@/lib/authSession";
import { getSupabaseService } from "@/lib/supabaseService";

const SWFL_BOUNDS = {
  minLat: 25.75,
  maxLat: 27.70,
  minLng: -82.85,
  maxLng: -81.25,
};

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }
    if (session.suspended) {
      return NextResponse.json(
        { error: "This account has been suspended pending safety review." },
        { status: 403 }
      );
    }

    const ipCountry = (req.headers.get("x-vercel-ip-country") || "").toUpperCase();
    const ipRegion = (req.headers.get("x-vercel-ip-country-region") || "").toUpperCase();

    if (ipCountry && ipCountry !== "US") {
      return NextResponse.json(
        {
          error:
            "Coastal Dusk Cohort 01 is currently restricted to Southwest Florida residents inside the United States. Please turn off any international VPN and try again.",
        },
        { status: 403 }
      );
    }

    const ipFlag = !ipCountry
      ? "local_dev"
      : ipRegion === "FL"
      ? "ok_fl"
      : `non_fl_ip_${ipRegion || "unknown"}`;

    const body = (await req.json()) as {
      lat?: number;
      lng?: number;
      accuracy?: number;
    };

    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: "Could not read your device location. Please allow location access and try again." },
        { status: 400 }
      );
    }

    const insideSwfl =
      lat >= SWFL_BOUNDS.minLat &&
      lat <= SWFL_BOUNDS.maxLat &&
      lng >= SWFL_BOUNDS.minLng &&
      lng <= SWFL_BOUNDS.maxLng;

    if (!insideSwfl) {
      return NextResponse.json(
        {
          error:
            "Your current GPS location appears to be outside Southwest Florida (Manatee through Collier counties). Cohort 01 is for local SWFL residents only.",
        },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const supabase = getSupabaseService();
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({
        location_verified: true,
        location_verified_at: nowIso,
        location_ip_flag: ipFlag,
      })
      .eq("id", session.userId)
      .select(PROFILE_SELECT_FIELDS)
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { error: error?.message || "Failed to save verification status." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      profile: updated,
      verifiedAt: nowIso,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Location verification failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}