import { NextResponse } from "next/server";
import { getSupabaseService, normalizeIdentity } from "@/lib/supabaseService";
import { attachSessionCookie } from "@/lib/authSession";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Please enter both your email and password." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseService();
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authErr || !authData.user) {
      return NextResponse.json(
        { error: "Invalid email or password. Double-check your credentials or sign up first." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select(
        "id, gender, cohort_status, display_name, birth_year, area_label, intent, min_age_pref, max_age_pref, max_drive_miles, smoking, occupation"
      )
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return NextResponse.json(
        { error: "Profile not found for this account. Please complete signup on /join." },
        { status: 404 }
      );
    }

    const { data: suspendedRows } = await supabase
      .from("suspended_identities")
      .select("identity")
      .in("identity", [authData.user.id.toLowerCase(), normalizeIdentity(profile.display_name)]);

    if (profile.cohort_status === "banned" || (suspendedRows && suspendedRows.length > 0)) {
      return NextResponse.json(
        { error: "This account has been suspended pending safety review." },
        { status: 403 }
      );
    }

    const res = NextResponse.json({ ok: true, profile });
    attachSessionCookie(res, authData.user.id, email);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign in failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}