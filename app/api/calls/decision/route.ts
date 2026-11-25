import { NextResponse } from "next/server";
import { getSupabaseService, normalizeIdentity } from "@/lib/supabaseService";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomName?: string;
      voterName?: string;
      targetName?: string;
      decision?: "like" | "pass";
    };

    const roomName = (body.roomName || "coastal-dusk-test").trim();
    const voterDisplay = (body.voterName || "").trim();
    const targetDisplay = (body.targetName || "").trim();
    const decision = body.decision;

    if (!voterDisplay || !targetDisplay || (decision !== "like" && decision !== "pass")) {
      return NextResponse.json(
        { error: "roomName, voterName, targetName, and valid decision are required." },
        { status: 400 }
      );
    }

    const voterId = normalizeIdentity(voterDisplay);
    const targetId = normalizeIdentity(targetDisplay);
    const supabase = getSupabaseService();

    const { data: blockRows } = await supabase
      .from("user_blocks")
      .select("id")
      .or(
        `and(blocker_identity.eq.${voterId},blocked_identity.eq.${targetId}),and(blocker_identity.eq.${targetId},blocked_identity.eq.${voterId})`
      );

    if (blockRows && blockRows.length > 0) {
      return NextResponse.json({ matched: false, blocked: true });
    }

    const { error: upsertErr } = await supabase.from("mvp_call_decisions").upsert(
      {
        room_name: roomName,
        voter_identity: voterId,
        voter_display: voterDisplay,
        target_identity: targetId,
        target_display: targetDisplay,
        decision,
      },
      { onConflict: "room_name,voter_identity,target_identity" }
    );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    if (decision === "pass") {
      return NextResponse.json({ matched: false, decision: "pass" });
    }

    const { data: partnerVote } = await supabase
      .from("mvp_call_decisions")
      .select("decision, voter_display")
      .eq("room_name", roomName)
      .eq("voter_identity", targetId)
      .eq("target_identity", voterId)
      .maybeSingle();

    if (partnerVote?.decision === "pass") {
      return NextResponse.json({ matched: false, waiting: false });
    }

    if (partnerVote?.decision === "like") {
      const sorted = [
        { id: voterId, display: voterDisplay },
        { id: targetId, display: partnerVote.voter_display || targetDisplay },
      ].sort((a, b) => a.id.localeCompare(b.id));

      const { data: matchRow, error: matchErr } = await supabase
        .from("mvp_matches")
        .upsert(
          {
            room_name: roomName,
            user_a: sorted[0].id,
            user_b: sorted[1].id,
            user_a_display: sorted[0].display,
            user_b_display: sorted[1].display,
            status: "active",
          },
          { onConflict: "user_a,user_b" }
        )
        .select("*")
        .single();

      if (matchErr) {
        return NextResponse.json({ error: matchErr.message }, { status: 500 });
      }

      return NextResponse.json({ matched: true, match: matchRow });
    }

    return NextResponse.json({ matched: false, waiting: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Decision failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomName = (searchParams.get("roomName") || "").trim();
    const voterId = normalizeIdentity(searchParams.get("voterName") || "");
    const targetId = normalizeIdentity(searchParams.get("targetName") || "");

    if (!voterId || !targetId) {
      return NextResponse.json({ matched: false }, { status: 400 });
    }

    const supabase = getSupabaseService();
    const [userA, userB] = [voterId, targetId].sort();

    const { data: matchRow } = await supabase
      .from("mvp_matches")
      .select("*")
      .eq("user_a", userA)
      .eq("user_b", userB)
      .eq("status", "active")
      .maybeSingle();

    if (matchRow) {
      return NextResponse.json({ matched: true, match: matchRow });
    }

    if (roomName) {
      const { data: partnerVote } = await supabase
        .from("mvp_call_decisions")
        .select("decision")
        .eq("room_name", roomName)
        .eq("voter_identity", targetId)
        .eq("target_identity", voterId)
        .maybeSingle();

      if (partnerVote?.decision === "pass") {
        return NextResponse.json({ matched: false, waiting: false });
      }
    }

    return NextResponse.json({ matched: false, waiting: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Poll failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}