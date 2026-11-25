import { NextResponse } from "next/server";
import { getAuthenticatedSession, isUuid } from "@/lib/authSession";
import { getSupabaseService, normalizeIdentity } from "@/lib/supabaseService";

function formatHeight(inches: number | null): string {
  if (!inches) return "Not listed";
  const ft = Math.floor(inches / 12);
  const rem = inches % 12;
  return `${ft}'${rem}"`;
}

function formatSmoking(val: string | null): string {
  if (val === "non_smoker" || val === "never") return "Non-smoker";
  if (val === "tobacco_vape" || val === "smoker" || val === "regularly" || val === "occasionally") {
    return "Tobacco / vape";
  }
  if (val === "cannabis_only") return "Cannabis only";
  if (val === "both_tobacco_cannabis") return "Tobacco & cannabis";
  return "Not listed";
}

function formatIntents(intents: string[] | null, fallbackIntent: string | null): string {
  const labels: Record<string, string> = {
    long_term: "Long-term",
    casual: "Casual",
    seeing_where_it_goes: "Seeing where it goes",
    open_to_long: "Open to long-term",
  };
  if (Array.isArray(intents) && intents.length > 0) {
    return intents.map((i) => labels[i] || i).join(", ");
  }
  if (fallbackIntent) return labels[fallbackIntent] || fallbackIntent;
  return "Not listed";
}

function formatKids(wantsKids: string | null, partnerPref: string | null): string {
  const mineLabels: Record<string, string> = {
    have_open_to_more: "Have kids, open to more",
    have_and_done: "Have kids, done",
    no_want: "No kids, want them",
    no_open: "No kids, open",
    no_none: "No kids, do not want",
    yes: "Want kids",
    open: "Open to kids",
    no: "Do not want kids",
  };
  const prefLabels: Record<string, string> = {
    open_to_kids: "Open to partner with kids",
    prefer_no_kids: "Prefer partner without kids",
  };
  const mine = wantsKids ? mineLabels[wantsKids] || wantsKids : "Not listed";
  const pref = partnerPref ? prefLabels[partnerPref] : "";
  return pref ? `${mine} (${pref})` : mine;
}

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    const { searchParams } = new URL(request.url);
    const matchId = (searchParams.get("matchId") || "").trim();
    const fallbackIdentity = normalizeIdentity(searchParams.get("identity") || "");
    const identity = normalizeIdentity(session?.userId || fallbackIdentity);
    const supabase = getSupabaseService();

    if (matchId) {
      const { data: match, error: matchErr } = await supabase
        .from("mvp_matches")
        .select("*")
        .eq("id", matchId)
        .maybeSingle();

      if (matchErr || !match) {
        return NextResponse.json({ error: "Match not found." }, { status: 404 });
      }

      if (match.status !== "active") {
        return NextResponse.json({ match, messages: [], blocked: true, partnerProfile: null });
      }

      const { data: messages, error: msgErr } = await supabase
        .from("mvp_messages")
        .select("*")
        .eq("match_id", matchId)
        .order("created_at", { ascending: true });

      if (msgErr) {
        return NextResponse.json({ error: msgErr.message }, { status: 500 });
      }

      let partnerProfile = null;
      const otherId = identity === match.user_a ? match.user_b : match.user_a;
      if (otherId && isUuid(otherId)) {
        const { data: p } = await supabase
          .from("profiles")
          .select(
            "display_name, birth_year, area_label, occupation, height_inches, smoking, intent, intents, wants_kids, partner_kids_pref, bio_prompts"
          )
          .eq("id", otherId)
          .maybeSingle();

        if (p) {
          const prompts = Array.isArray(p.bio_prompts)
            ? (p.bio_prompts as Array<{ answer?: string }>)
            : [];
          const currentYear = new Date().getFullYear();
          partnerProfile = {
            displayName: p.display_name,
            age: p.birth_year ? currentYear - p.birth_year : null,
            areaLabel: p.area_label,
            occupation: p.occupation || "Not listed",
            height: formatHeight(p.height_inches),
            smoking: formatSmoking(p.smoking),
            intent: formatIntents(p.intents, p.intent),
            kids: formatKids(p.wants_kids, p.partner_kids_pref),
            firstMeetSpot: prompts[0]?.answer || "Ask in chat",
          };
        }
      }

      return NextResponse.json({
        match,
        messages: messages || [],
        blocked: false,
        partnerProfile,
      });
    }

    if (!identity) {
      return NextResponse.json({ matches: [] });
    }

    const { data: matches, error } = await supabase
      .from("mvp_matches")
      .select("*")
      .eq("status", "active")
      .or(`user_a.eq.${identity},user_b.eq.${identity}`)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ matches: matches || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load messages";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    const body = (await request.json()) as {
      matchId?: string;
      senderId?: string;
      senderName?: string;
      text?: string;
    };

    const matchId = (body.matchId || "").trim();
    const senderId = normalizeIdentity(session?.userId || body.senderId || body.senderName || "");
    const senderDisplay = (session?.profile.display_name || body.senderName || "").trim();
    const text = (body.text || "").trim();

    if (!matchId || !senderId || !senderDisplay || !text) {
      return NextResponse.json(
        { error: "matchId, sender, and text are required." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseService();

    const { data: match } = await supabase
      .from("mvp_matches")
      .select("id, status, user_a, user_b")
      .eq("id", matchId)
      .maybeSingle();

    if (!match || match.status !== "active") {
      return NextResponse.json(
        { error: "This match is no longer active." },
        { status: 403 }
      );
    }

    if (match.user_a !== senderId && match.user_b !== senderId) {
      return NextResponse.json({ error: "Not authorized for this chat." }, { status: 403 });
    }

    const { data: inserted, error } = await supabase
      .from("mvp_messages")
      .insert({
        match_id: matchId,
        sender_identity: senderId,
        sender_display: senderDisplay,
        body: text,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}