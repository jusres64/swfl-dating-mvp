import { NextResponse } from "next/server";
import { getSupabaseService, normalizeIdentity } from "@/lib/supabaseService";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const matchId = (searchParams.get("matchId") || "").trim();
    const identity = normalizeIdentity(searchParams.get("identity") || "");
    const supabase = getSupabaseService();

    // Fetch messages for one match
    if (matchId) {
      const { data: match, error: matchErr } = await supabase
        .from("matches")
        .select("*")
        .eq("id", matchId)
        .maybeSingle();

      if (matchErr || !match) {
        return NextResponse.json({ error: "Match not found." }, { status: 404 });
      }

      if (match.status !== "active") {
        return NextResponse.json({ match, messages: [], blocked: true });
      }

      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("*")
        .eq("match_id", matchId)
        .order("created_at", { ascending: true });

      if (msgErr) {
        return NextResponse.json({ error: msgErr.message }, { status: 500 });
      }

      return NextResponse.json({ match, messages: messages || [], blocked: false });
    }

    // List all active matches for a user
    if (!identity) {
      return NextResponse.json({ matches: [] });
    }

    const { data: matches, error } = await supabase
      .from("matches")
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
    const body = (await request.json()) as {
      matchId?: string;
      senderName?: string;
      text?: string;
    };

    const matchId = (body.matchId || "").trim();
    const senderDisplay = (body.senderName || "").trim();
    const text = (body.text || "").trim();

    if (!matchId || !senderDisplay || !text) {
      return NextResponse.json(
        { error: "matchId, senderName, and text are required." },
        { status: 400 }
      );
    }

    const senderId = normalizeIdentity(senderDisplay);
    const supabase = getSupabaseService();

    const { data: match } = await supabase
      .from("matches")
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
      .from("messages")
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