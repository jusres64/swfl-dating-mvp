import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { isUuid } from "@/lib/authSession";
import { getSupabaseService, normalizeIdentity } from "@/lib/supabaseService";

type AdminActionBody =
  | { action: "approve_photo"; userId: string }
  | { action: "reject_photo"; userId: string }
  | { action: "set_cohort_status"; userId: string; status: "active" | "waitlisted" | "banned" }
  | { action: "review_report"; reportId: string }
  | { action: "ban_reported"; reportId: string; identity: string; reason?: string }
  | { action: "unban_identity"; identity: string }
  | { action: "delete_block"; blockId: string };

export async function POST(request: Request) {
  try {
    const admin = await requireAdminSession();
    if (!admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = (await request.json()) as AdminActionBody;
    const supabase = getSupabaseService();

    switch (body.action) {
      case "approve_photo": {
        const { error } = await supabase
          .from("profiles")
          .update({
            photo_verification_status: "verified",
            photo_matched: true,
            liveness_checked: true,
          })
          .eq("id", body.userId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, message: "Photo Verified badge approved." });
      }

      case "reject_photo": {
        const { error } = await supabase
          .from("profiles")
          .update({
            photo_verification_status: "rejected",
            photo_matched: false,
          })
          .eq("id", body.userId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await supabase.from("mvp_queue").delete().eq("user_id", body.userId);
        return NextResponse.json({
          ok: true,
          message: "Selfie rejected. Member will be prompted to retake before joining.",
        });
      }

      case "set_cohort_status": {
        const { userId, status } = body;
        if (!["active", "waitlisted", "banned"].includes(status)) {
          return NextResponse.json({ error: "Invalid cohort status." }, { status: 400 });
        }

        const { data: targetProfile } = await supabase
          .from("profiles")
          .select("id, display_name")
          .eq("id", userId)
          .maybeSingle();

        const { error } = await supabase
          .from("profiles")
          .update({ cohort_status: status })
          .eq("id", userId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        if (status === "banned") {
          await supabase.from("mvp_queue").delete().eq("user_id", userId);
          await supabase.from("suspended_identities").upsert(
            {
              identity: userId.toLowerCase(),
              report_count: 1,
              reason: `Banned by admin (${admin.email})`,
            },
            { onConflict: "identity" }
          );
        } else if (status === "active") {
          const keys = [userId.toLowerCase()];
          if (targetProfile?.display_name) {
            keys.push(normalizeIdentity(targetProfile.display_name));
          }
          await supabase.from("suspended_identities").delete().in("identity", keys);
        }

        return NextResponse.json({ ok: true, message: `Member status updated to ${status}.` });
      }

      case "review_report": {
        const { error } = await supabase
          .from("safety_reports")
          .update({ status: "reviewed" })
          .eq("id", body.reportId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, message: "Report marked as reviewed." });
      }

      case "ban_reported": {
        const targetId = normalizeIdentity(body.identity);
        const reason = (body.reason || "Actioned from safety report").trim();

        await supabase
          .from("safety_reports")
          .update({ status: "actioned" })
          .eq("id", body.reportId);

        await supabase.from("suspended_identities").upsert(
          {
            identity: targetId,
            report_count: 2,
            reason: `Banned by admin: ${reason}`,
          },
          { onConflict: "identity" }
        );

        if (isUuid(targetId)) {
          await supabase
            .from("profiles")
            .update({ cohort_status: "banned" })
            .eq("id", targetId);
          await supabase.from("mvp_queue").delete().eq("user_id", targetId);
        }

        return NextResponse.json({ ok: true, message: "Account banned and report actioned." });
      }

      case "unban_identity": {
        const targetId = normalizeIdentity(body.identity);
        await supabase.from("suspended_identities").delete().eq("identity", targetId);

        if (isUuid(targetId)) {
          const { data: p } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", targetId)
            .maybeSingle();

          await supabase
            .from("profiles")
            .update({ cohort_status: "active" })
            .eq("id", targetId);

          if (p?.display_name) {
            await supabase
              .from("suspended_identities")
              .delete()
              .eq("identity", normalizeIdentity(p.display_name));
          }
        }

        return NextResponse.json({ ok: true, message: "Suspension removed and account restored." });
      }

      case "delete_block": {
        const { error } = await supabase.from("user_blocks").delete().eq("id", body.blockId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, message: "Block removed." });
      }

      default:
        return NextResponse.json({ error: "Unknown admin action." }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin action failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}