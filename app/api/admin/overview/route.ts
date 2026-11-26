import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { getSupabaseService } from "@/lib/supabaseService";

type RawProfile = {
  id: string;
  created_at: string;
  gender: "man" | "woman";
  cohort_status: string;
  display_name: string;
  birth_year: number;
  area_label: string;
  occupation: string | null;
  photo_urls: string[] | null;
  selfie_path: string | null;
  photo_verification_status: string | null;
  location_verified: boolean | null;
  location_verified_at: string | null;
  location_ip_flag: string | null;
};

export async function GET() {
  try {
    const admin = await requireAdminSession();
    if (!admin) {
      return NextResponse.json(
        { error: "Admin access required. Sign in with your admin email first." },
        { status: 403 }
      );
    }

    const supabase = getSupabaseService();
    const staleCutoff = new Date(Date.now() - 45 * 1000).toISOString();

    const [
      { data: profilesData, error: profilesErr },
      { data: reportsData, error: reportsErr },
      { data: suspendedData, error: suspendedErr },
      { data: blocksData, error: blocksErr },
      { count: liveQueueCount },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, created_at, gender, cohort_status, display_name, birth_year, area_label, occupation, photo_urls, selfie_path, photo_verification_status, location_verified, location_verified_at, location_ip_flag"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("safety_reports")
        .select("id, room_name, reporter_identity, reported_identity, reason, status, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("suspended_identities")
        .select("identity, report_count, reason, suspended_at")
        .order("suspended_at", { ascending: false }),
      supabase
        .from("user_blocks")
        .select("id, blocker_identity, blocked_identity, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("mvp_queue")
        .select("user_id", { count: "exact", head: true })
        .eq("status", "waiting")
        .gte("last_seen_at", staleCutoff),
    ]);

    if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 });
    if (reportsErr) return NextResponse.json({ error: reportsErr.message }, { status: 500 });
    if (suspendedErr) return NextResponse.json({ error: suspendedErr.message }, { status: 500 });
    if (blocksErr) return NextResponse.json({ error: blocksErr.message }, { status: 500 });

    const profiles = (profilesData || []) as RawProfile[];

    const allMediaPaths: string[] = [];
    for (const p of profiles) {
      if (p.selfie_path) allMediaPaths.push(p.selfie_path);
      if (Array.isArray(p.photo_urls)) {
        for (const path of p.photo_urls) {
          if (path) allMediaPaths.push(path);
        }
      }
    }

    const signedMap = new Map<string, string>();
    if (allMediaPaths.length > 0) {
      const { data: signedBatch } = await supabase.storage
        .from("vault-media")
        .createSignedUrls(allMediaPaths, 3600);
      for (const item of signedBatch || []) {
        if (item.path && item.signedUrl) {
          signedMap.set(item.path, item.signedUrl);
        }
      }
    }

    const nameById = new Map<string, string>();
    const currentYear = new Date().getFullYear();

    const enrichedProfiles = profiles.map((p) => {
      nameById.set(p.id.toLowerCase(), p.display_name);
      const photoSignedUrls = (Array.isArray(p.photo_urls) ? p.photo_urls : [])
        .map((path) => signedMap.get(path) || "")
        .filter(Boolean);
      const selfieSignedUrl = p.selfie_path ? signedMap.get(p.selfie_path) || null : null;

      return {
        ...p,
        age: p.birth_year ? currentYear - p.birth_year : null,
        photoSignedUrls,
        selfieSignedUrl,
      };
    });

    const resolveName = (identity: string) => {
      const found = nameById.get(identity.toLowerCase());
      return found ? `${found} (${identity.slice(0, 8)})` : identity;
    };

    const reports = (reportsData || []).map((r) => ({
      ...r,
      reporterDisplay: resolveName(r.reporter_identity),
      reportedDisplay: resolveName(r.reported_identity),
    }));

    const suspended = (suspendedData || []).map((s) => ({
      ...s,
      displayName: resolveName(s.identity),
    }));

    const blocks = (blocksData || []).map((b) => ({
      ...b,
      blockerDisplay: resolveName(b.blocker_identity),
      blockedDisplay: resolveName(b.blocked_identity),
    }));

    const stats = {
      activeMen: profiles.filter((p) => p.gender === "man" && p.cohort_status === "active").length,
      waitlistedMen: profiles.filter((p) => p.gender === "man" && p.cohort_status === "waitlisted")
        .length,
      activeWomen: profiles.filter((p) => p.gender === "woman" && p.cohort_status === "active")
        .length,
      waitlistedWomen: profiles.filter(
        (p) => p.gender === "woman" && p.cohort_status === "waitlisted"
      ).length,
      pendingPhotos: profiles.filter((p) => p.photo_verification_status === "pending").length,
      pendingReports: reports.filter((r) => r.status === "pending").length,
      suspendedCount: suspended.length,
      liveQueueCount: liveQueueCount || 0,
    };

    return NextResponse.json({
      adminEmail: admin.email,
      stats,
      profiles: enrichedProfiles,
      reports,
      suspended,
      blocks,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load admin overview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}