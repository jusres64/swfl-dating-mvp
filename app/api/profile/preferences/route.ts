import { NextResponse } from "next/server";
import { getAuthenticatedSession, PROFILE_SELECT_FIELDS } from "@/lib/authSession";
import { getSupabaseService } from "@/lib/supabaseService";

const SWFL_AREAS: Record<string, { lat: number; lng: number }> = {
  "Charlotte County (Punta Gorda / Port Charlotte)": { lat: 26.953, lng: -82.068 },
  "Sarasota & Manatee (Sarasota / Bradenton / Venice / North Port)": { lat: 27.27, lng: -82.48 },
  "Lee County (Fort Myers / Cape Coral / Bonita Springs)": { lat: 26.58, lng: -81.88 },
  "Collier County (Naples / Marco Island)": { lat: 26.142, lng: -81.7948 },
};

const VALID_INTENTS = new Set(["long_term", "casual", "seeing_where_it_goes"]);
const VALID_KIDS = new Set([
  "have_open_to_more",
  "have_and_done",
  "no_want",
  "no_open",
  "no_none",
]);
const VALID_PARTNER_KIDS = new Set(["open_to_kids", "prefer_no_kids"]);
const VALID_SMOKING = new Set([
  "non_smoker",
  "tobacco_vape",
  "cannabis_only",
  "both_tobacco_cannabis",
]);

export async function PATCH(request: Request) {
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

    const body = (await request.json()) as {
      areaLabel?: string;
      minAgePref?: number;
      maxAgePref?: number;
      maxDriveMiles?: number;
      intents?: string[];
      wantsKids?: string;
      partnerKidsPref?: string;
      smoking?: string;
      occupation?: string;
      firstMeetSpot?: string;
    };

    const areaLabel =
      body.areaLabel && SWFL_AREAS[body.areaLabel]
        ? body.areaLabel
        : "Charlotte County (Punta Gorda / Port Charlotte)";
    const coords = SWFL_AREAS[areaLabel];

    const minAge = Number(body.minAgePref);
    const maxAge = Number(body.maxAgePref);
    if (isNaN(minAge) || isNaN(maxAge) || minAge < 18 || maxAge > 99 || minAge > maxAge) {
      return NextResponse.json(
        { error: "Please enter a valid age range (18 to 99, with Min Age at or below Max Age)." },
        { status: 400 }
      );
    }

    const maxMiles = Number(body.maxDriveMiles);
    if (isNaN(maxMiles) || maxMiles < 5 || maxMiles > 150) {
      return NextResponse.json(
        { error: "Max drive distance must be between 5 and 150 miles." },
        { status: 400 }
      );
    }

    const cleanIntents = Array.isArray(body.intents)
      ? body.intents.filter((item) => typeof item === "string" && VALID_INTENTS.has(item))
      : [];

    if (cleanIntents.length === 0) {
      return NextResponse.json(
        { error: "Select at least one relationship intention." },
        { status: 400 }
      );
    }

    const primaryIntent = cleanIntents.includes("long_term")
      ? cleanIntents.length > 1
        ? "open_to_long"
        : "long_term"
      : cleanIntents.includes("seeing_where_it_goes")
      ? "open_to_long"
      : "casual";

    const cleanKids = VALID_KIDS.has(String(body.wantsKids))
      ? String(body.wantsKids)
      : "no_open";
    const cleanPartnerKids = VALID_PARTNER_KIDS.has(String(body.partnerKidsPref))
      ? String(body.partnerKidsPref)
      : "open_to_kids";
    const cleanSmoking = VALID_SMOKING.has(String(body.smoking))
      ? String(body.smoking)
      : "non_smoker";

    const cleanOccupation = (body.occupation || "").trim();
    if (!cleanOccupation) {
      return NextResponse.json({ error: "Occupation is required." }, { status: 400 });
    }

    const cleanSpot = (body.firstMeetSpot || "").trim();
    if (cleanSpot.length < 3) {
      return NextResponse.json(
        { error: "Favorite local spot for a first meet is required." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseService();
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({
        area_label: areaLabel,
        approx_lat: coords.lat,
        approx_lng: coords.lng,
        min_age_pref: minAge,
        max_age_pref: maxAge,
        max_drive_miles: maxMiles,
        intent: primaryIntent,
        intents: cleanIntents,
        wants_kids: cleanKids,
        partner_kids_pref: cleanPartnerKids,
        smoking: cleanSmoking,
        occupation: cleanOccupation,
        bio_prompts: [{ question: "Favorite first-meet spot", answer: cleanSpot }],
      })
      .eq("id", session.userId)
      .select(PROFILE_SELECT_FIELDS)
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { error: error?.message || "Could not update preferences." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, profile: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save preferences.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}