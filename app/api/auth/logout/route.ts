import { NextResponse } from "next/server";
import { clearSessionCookie, getAuthenticatedSession } from "@/lib/authSession";
import { getSupabaseService } from "@/lib/supabaseService";

export async function POST() {
  const session = await getAuthenticatedSession();
  if (session) {
    const supabase = getSupabaseService();
    await supabase.from("mvp_queue").delete().eq("user_id", session.userId);
  }

  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}