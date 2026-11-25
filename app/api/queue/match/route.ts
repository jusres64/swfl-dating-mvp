import crypto from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedSession, AuthProfile } from "@/lib/authSession";
import { getSupabaseService, normalizeIdentity } from "@/lib/supabaseService";

function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(request: Request) {
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

    const body = (await request.json().catch(() => ({}))) as {
      action?: "join" | "poll" | "leave" | "finish_call";
      allowRematch?: boolean;
    };
    const action = body.action || "poll";
    const allowRematch = Boolean(body.allowRematch);
    const me = session.profile;
    const supabase = getSupabaseService();

    // Leave queue or finish call cleanly
    if (action === "leave" || action === "finish_call") {
      await supabase.from("mvp_queue").delete().eq("user_id", me.id);
      return NextResponse.json({ status: "idle" });
    }

    const nowIso = new Date().toISOString();
    const staleCutoff = new Date(Date.now() - 45 * 1000).toISOString();

    // 1. Check if someone already matched with us in the last few seconds
    const { data: myQueueRow } = await supabase
      .from("mvp_queue")
      .select("status, matched_with, room_name")
      .eq("user_id", me.id)
      .maybeSingle();

    if (myQueueRow?.status === "matched" && myQueueRow.room_name && myQueueRow.matched_with) {
      const { data: partnerProfile } = await supabase
        .from("profiles")
        .select("id, display_name, area_label")
        .eq("id", myQueueRow.matched_with)
        .maybeSingle();

      // Mark as in_call so we don't re-trigger the same room later
      await supabase
        .from("mvp_queue")
        .update({ status: "in_call", last_seen_at: nowIso })
        .eq("user_id", me.id);

      return NextResponse.json({
        status: "matched",
        roomName: myQueueRow.room_name,
        partner: {
          id: myQueueRow.matched_with,
          displayName: partnerProfile?.display_name || "Your Match",
          areaLabel: partnerProfile?.area_label || "Southwest Florida",
        },
      });
    }

    // 2. Register or heartbeat our waiting presence
    await supabase.from("mvp_queue").upsert(
      {
        user_id: me.id,
        gender: me.gender,
        status: "waiting",
        matched_with: null,
        room_name: null,
        last_seen_at: nowIso,
        ...(action === "join" ? { joined_at: nowIso } : {}),
      },
      { onConflict: "user_id" }
    );

    // 3. Remove abandoned waiting rows older than 45s
    await supabase
      .from("mvp_queue")
      .delete()
      .eq("status", "waiting")
      .lt("last_seen_at", staleCutoff);

    // 4. Find waiting candidates of the opposite gender
    const targetGender = me.gender === "man" ? "woman" : "man";
    const { data: waitingRows } = await supabase
      .from("mvp_queue")
      .select("user_id, joined_at")
      .eq("status", "waiting")
      .eq("gender", targetGender)
      .gte("last_seen_at", staleCutoff)
      .neq("user_id", me.id)
      .order("joined_at", { ascending: true });

    const waitingIds = (waitingRows || []).map((r) => r.user_id);

    const { count: totalWaiting } = await supabase
      .from("mvp_queue")
      .select("user_id", { count: "exact", head: true })
      .eq("status", "waiting")
      .gte("last_seen_at", staleCutoff);

    if (waitingIds.length === 0) {
      return NextResponse.json({
        status: "waiting",
        waitingCount: totalWaiting || 1,
      });
    }

    // 5. Fetch candidate profiles, safety blocks, suspensions, and recent call history
    const { data: candidateProfiles } = await supabase
      .from("profiles")
      .select(
        "id, gender, cohort_status, display_name, birth_year, area_label, approx_lat, approx_lng, intent, min_age_pref, max_age_pref, max_drive_miles, wants_kids, smoking, occupation, height_inches, bio_prompts"
      )
      .in("id", waitingIds)
      .neq("cohort_status", "banned");

    const myIdentifiers = [me.id.toLowerCase(), normalizeIdentity(me.display_name)];
    const { data: blockRows } = await supabase
      .from("user_blocks")
      .select("blocker_identity, blocked_identity")
      .or(
        `blocker_identity.in.(${myIdentifiers.join(",")}),blocked_identity.in.(${myIdentifiers.join(",")})`
      );

    const blockedSet = new Set<string>();
    for (const b of blockRows || []) {
      blockedSet.add(b.blocker_identity.toLowerCase());
      blockedSet.add(b.blocked_identity.toLowerCase());
    }
    myIdentifiers.forEach((id) => blockedSet.delete(id));

    const { data: suspendedRows } = await supabase
      .from("suspended_identities")
      .select("identity");
    const suspendedSet = new Set((suspendedRows || []).map((r) => r.identity.toLowerCase()));

    // Check who we have already called recently (last 6 hours)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: historyRows } = await supabase
      .from("mvp_call_history")
      .select("user_a, user_b")
      .gte("created_at", sixHoursAgo)
      .or(`user_a.eq.${me.id},user_b.eq.${me.id}`);

    const recentPartnerIds = new Set<string>();
    for (const h of historyRows || []) {
      recentPartnerIds.add(h.user_a === me.id ? h.user_b : h.user_a);
    }

    // 6. Filter compatible candidates (age range + SWFL drive distance + zero safety blocks)
    const currentYear = new Date().getFullYear();
    const myAge = currentYear - me.birth_year;
    const profilesById = new Map<string, AuthProfile>();
    for (const p of (candidateProfiles || []) as AuthProfile[]) {
      profilesById.set(p.id, p);
    }

    const compatibleFresh: AuthProfile[] = [];
    const compatibleRecent: AuthProfile[] = [];

    for (const cid of waitingIds) {
      const cand = profilesById.get(cid);
      if (!cand) continue;

      const candKeys = [cand.id.toLowerCase(), normalizeIdentity(cand.display_name)];
      if (candKeys.some((k) => blockedSet.has(k) || suspendedSet.has(k))) {
        continue;
      }

      const candAge = currentYear - cand.birth_year;
      const ageCompatible =
        candAge >= me.min_age_pref &&
        candAge <= me.max_age_pref &&
        myAge >= cand.min_age_pref &&
        myAge <= cand.max_age_pref;

      if (!ageCompatible) continue;

      const miles = distanceMiles(
        me.approx_lat,
        me.approx_lng,
        cand.approx_lat,
        cand.approx_lng
      );
      const maxAllowedMiles = Math.min(me.max_drive_miles || 45, cand.max_drive_miles || 45);
      if (miles > maxAllowedMiles) continue;

      if (recentPartnerIds.has(cand.id)) {
        if (allowRematch) compatibleRecent.push(cand);
      } else {
        compatibleFresh.push(cand);
      }
    }

    const selected = compatibleFresh[0] || compatibleRecent[0];
    if (!selected) {
      return NextResponse.json({
        status: "waiting",
        waitingCount: totalWaiting || 1,
      });
    }

    // 7. Atomically claim the selected waiting partner
    const roomName = `drop-${crypto.randomUUID().slice(0, 8)}`;
    const { data: claimed } = await supabase
      .from("mvp_queue")
      .update({
        status: "matched",
        matched_with: me.id,
        room_name: roomName,
        last_seen_at: nowIso,
      })
      .eq("user_id", selected.id)
      .eq("status", "waiting")
      .select("user_id");

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({
        status: "waiting",
        waitingCount: totalWaiting || 1,
      });
    }

    // Mark ourselves as in_call and log call history
    await supabase
      .from("mvp_queue")
      .update({
        status: "in_call",
        matched_with: selected.id,
        room_name: roomName,
        last_seen_at: nowIso,
      })
      .eq("user_id", me.id);

    const [sortedA, sortedB] = [me.id, selected.id].sort();
    await supabase.from("mvp_call_history").insert({
      room_name: roomName,
      user_a: sortedA,
      user_b: sortedB,
    });

    return NextResponse.json({
      status: "matched",
      roomName,
      partner: {
        id: selected.id,
        displayName: selected.display_name,
        areaLabel: selected.area_label,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Queue matching error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}