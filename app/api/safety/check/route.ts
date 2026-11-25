import { NextResponse } from "next/server";
import { getSupabaseService, normalizeIdentity } from "@/lib/supabaseService";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { identity?: string };
    const identity = normalizeIdentity(body.identity || "");
    if (!identity) {
      return NextResponse.json({ allowed: false, reason: "Name is required." }, { status: 400 });
    }

    const supabase = getSupabaseService();
    const { data: suspended, error } = await supabase
      .from("suspended_identities")
      .select("identity, reason, report_count")
      .eq("identity", identity)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ allowed: false, reason: error.message }, { status: 500 });
    }

    if (suspended) {
      return NextResponse.json({
        allowed: false,
        suspended: true,
        reason: "This account has been suspended pending safety review.",
      });
    }

    return NextResponse.json({ allowed: true, suspended: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Safety check failed";
    return NextResponse.json({ allowed: false, reason: message }, { status: 500 });
  }
}