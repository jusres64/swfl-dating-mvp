import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  getAuthenticatedSession,
  isVerificationGateComplete,
  AuthProfile,
  PROFILE_SELECT_FIELDS,
} from "@/lib/authSession";
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

function getEffectiveIntents(p: AuthProfile): Set<string> {
  if (Array.isArray(p.intents) && p.intents.length > 0) {
    return new Set(p.intents);
  }
  if (p.intent === "open_to_long") {
    return new Set(["long_term", "seeing_where_it_goes", "casual"]);
  }
  if (p.intent === "casual") {
    return new Set(["casual"]);
  }
  return new Set(["long_term"]);
}

function hasIntentOverlap(a: AuthProfile, b: AuthProfile): boolean {
  const setA = getEffectiveIntents(a);
  const setB = getEffectiveIntents(b);
  for (const item of setA) {
    if (setB.has(item)) return true;
  }
  return false;
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

    if (action === "leave" || action === "finish_call") {
      await supabase.from("mvp_queue").delete().eq("user_id", me.id);
      return NextResponse.json({ status: "idle" });
    }

    if (!isVerificationGateComplete(me)) {
      await supabase.from("mvp_queue").delete().eq("user_id", me.id);
      return NextResponse.json(
        {
          error:
            "Complete the Verification Gate (SWFL GPS, at least 1 Vault photo, and a live selfie) before joining tonight's queue.",
          needsVerification: true,
        },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const staleCutoff = new Date(Date.now() - 45 * 1000).toISOString();

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

    await supabase
      .from("mvp_queue")
      .delete()
      .eq("status", "waiting")
      .lt("last_seen_at", staleCutoff);

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
      const sameGenderNote =
        allowRematch && (totalWaiting || 1) > 1
          ? `Beta note: another user is in the queue, but their profile is also set to "${me.gender}".`
          : null;
      return NextResponse.json({
        status: "waiting",
        waitingCount: totalWaiting || 1,
        waitReason: sameGenderNote,
      });
    }

    const { data: candidateProfiles } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT_FIELDS)
      .in("id", waitingIds)
      .neq("cohort_status", "banned");

    const myIdentifiers = [me.id.toLowerCase(), normalizeIdentity(me.display_name)];
    const [{ data: blockedByMe }, { data: blockedMe }] = await Promise.all([
      supabase
        .from("user_blocks")
        .select("blocked_identity")
        .in("blocker_identity", myIdentifiers),
      supabase
        .from("user_blocks")
        .select("blocker_identity")
        .in("blocked_identity", myIdentifiers),
    ]);

    const blockedSet = new Set<string>();
    for (const row of blockedByMe || []) blockedSet.add(row.blocked_identity.toLowerCase());
    for (const row of blockedMe || []) blockedSet.add(row.blocker_identity.toLowerCase());
    myIdentifiers.forEach((id) => blockedSet.delete(id));

    const { data: suspendedRows } = await supabase
      .from("suspended_identities")
      .select("identity");
    const suspendedSet = new Set((suspendedRows || []).map((r) => r.identity.toLowerCase()));

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

    const currentYear = new Date().getFullYear();
    const myAge = currentYear - me.birth_year;
    const profilesById = new Map<string, AuthProfile>();
    for (const p of (candidateProfiles || []) as AuthProfile[]) {
      profilesById.set(p.id, p);
    }

    const compatibleFresh: AuthProfile[] = [];
    const compatibleRecent: AuthProfile[] = [];
    const skipReasons: string[] = [];

    for (const cid of waitingIds) {
      const cand = profilesById.get(cid);
      if (!cand) {
        skipReasons.push("Waiting partner account is banned or missing a profile.");
        continue;
      }

      if (!isVerificationGateComplete(cand)) {
        skipReasons.push("Waiting partner has not completed verification yet.");
        continue;
      }

      const candKeys = [cand.id.toLowerCase(), normalizeIdentity(cand.display_name)];
      if (candKeys.some((k) => blockedSet.has(k))) {
        skipReasons.push("Skipped due to an existing Safety block between these accounts.");
        continue;
      }
      if (candKeys.some((k) => suspendedSet.has(k))) {
        skipReasons.push("Skipped because the waiting partner account is suspended.");
        continue;
      }

      const candAge = currentYear - cand.birth_year;
      const candInMyRange = candAge >= me.min_age_pref && candAge <= me.max_age_pref;
      const meInCandRange = myAge >= cand.min_age_pref && myAge <= cand.max_age_pref;

      if (!candInMyRange || !meInCandRange) {
        skipReasons.push(
          `Age range mismatch: you are ${myAge} (seeking ${me.min_age_pref}-${me.max_age_pref}), waiting partner is ${candAge} (seeking ${cand.min_age_pref}-${cand.max_age_pref}).`
        );
        continue;
      }

      if (!hasIntentOverlap(me, cand)) {
        skipReasons.push("No overlapping relationship intention between the two accounts.");
        continue;
      }

      const miles = distanceMiles(
        me.approx_lat,
        me.approx_lng,
        cand.approx_lat,
        cand.approx_lng
      );
      const maxAllowedMiles = Math.min(me.max_drive_miles || 45, cand.max_drive_miles || 45);
      if (miles > maxAllowedMiles) {
        skipReasons.push(
          `Distance mismatch: ${Math.round(miles)} mi apart exceeds the ${maxAllowedMiles} mi limit.`
        );
        continue;
      }

      if (recentPartnerIds.has(cand.id)) {
        if (allowRematch) {
          compatibleRecent.push(cand);
        } else {
          skipReasons.push("Already paired recently (enable Beta test mode to re-match).");
        }
      } else {
        compatibleFresh.push(cand);
      }
    }

    const selected = compatibleFresh[0] || compatibleRecent[0];
    if (!selected) {
      return NextResponse.json({
        status: "waiting",
        waitingCount: totalWaiting || 1,
        waitReason: allowRematch && skipReasons.length > 0 ? `Beta note: ${skipReasons[0]}` : null,
      });
    }

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
        waitReason: null,
      });
    }

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