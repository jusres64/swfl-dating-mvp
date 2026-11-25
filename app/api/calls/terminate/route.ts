import { NextResponse } from "next/server";
import { getAuthenticatedSession, isUuid } from "@/lib/authSession";
import { getSupabaseService, normalizeIdentity } from "@/lib/supabaseService";

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    const body = (await request.json()) as {
      roomName?: string;
      reporter?: string;
      reported?: string;
      reportedId?: string;
      reason?: string;
      matchId?: string;
    };

    const reporterId = normalizeIdentity(session?.userId || body.reporter || "");
    const reportedId = normalizeIdentity(body.reportedId || body.reported || "");
    const reason = (body.reason || "Safety concern").trim();
    const roomName = (body.roomName || "").trim();

    if (!reporterId || !reportedId) {
      return NextResponse.json(
        { ok: false, error: "Both reporter and reported identities are required." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseService();

    const { error: reportErr } = await supabase.from("safety_reports").insert({
      room_name: roomName || null,
      reporter_identity: reporterId,
      reported_identity: reportedId,
      reason,
    });
    if (reportErr) {
      return NextResponse.json({ ok: false, error: reportErr.message }, { status: 500 });
    }

    await supabase.from("user_blocks").upsert(
      {
        blocker_identity: reporterId,
        blocked_identity: reportedId,
        reason,
      },
      { onConflict: "blocker_identity,blocked_identity" }
    );

    const [userA, userB] = [reporterId, reportedId].sort();
    await supabase
      .from("mvp_matches")
      .update({ status: "blocked" })
      .eq("user_a", userA)
      .eq("user_b", userB);

    if (body.matchId) {
      await supabase.from("mvp_matches").update({ status: "blocked" }).eq("id", body.matchId);
    }

    const { data: priorReports } = await supabase
      .from("safety_reports")
      .select("reporter_identity")
      .eq("reported_identity", reportedId);

    const uniqueReporters = new Set(
      (priorReports || []).map((row) => row.reporter_identity)
    );
    const reportCount = uniqueReporters.size;
    let autoSuspended = false;

    if (reportCount >= 2) {
      await supabase.from("suspended_identities").upsert(
        {
          identity: reportedId,
          report_count: reportCount,
          reason: `Auto-suspended after ${reportCount} unique safety reports. Latest: ${reason}`,
        },
        { onConflict: "identity" }
      );
      if (isUuid(reportedId)) {
        await supabase
          .from("profiles")
          .update({ cohort_status: "banned" })
          .eq("id", reportedId);
        await supabase.from("mvp_queue").delete().eq("user_id", reportedId);
      }
      autoSuspended = true;
    }

    return NextResponse.json({ ok: true, reportCount, autoSuspended });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record report";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}