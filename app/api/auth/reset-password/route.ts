import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseService";
import { attachSessionCookie } from "@/lib/authSession";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      accessToken?: string;
      tokenHash?: string;
      newPassword?: string;
    };

    const newPassword = body.newPassword || "";
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Please choose a new password with at least 6 characters." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseService();
    let userId: string | null = null;
    let userEmail = "";

    if (body.accessToken) {
      const { data, error } = await supabase.auth.getUser(body.accessToken);
      if (error || !data.user) {
        return NextResponse.json(
          { error: "This reset link has expired or is invalid. Please request a fresh one." },
          { status: 401 }
        );
      }
      userId = data.user.id;
      userEmail = data.user.email || "";
    } else if (body.tokenHash) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: body.tokenHash,
        type: "recovery",
      });
      if (error || !data.user) {
        return NextResponse.json(
          { error: "This reset link has expired or is invalid. Please request a fresh one." },
          { status: 401 }
        );
      }
      userId = data.user.id;
      userEmail = data.user.email || "";
    } else {
      return NextResponse.json(
        { error: "Missing recovery token. Please open the reset link directly from your email." },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true });
    attachSessionCookie(res, userId, userEmail);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Password reset failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}