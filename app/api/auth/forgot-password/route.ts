import { NextRequest, NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseService";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = (body.email || "").trim().toLowerCase();

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const origin =
      req.headers.get("origin") ||
      (req.headers.get("host") ? `https://${req.headers.get("host")}` : "https://swfl-dating-mvp.vercel.app");

    const redirectTo = `${origin}/reset-password`;
    const supabase = getSupabaseService();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send reset email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}