import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/authSession";
import { isAdminEmail } from "@/lib/adminAuth";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, isAdmin: false, profile: null });
  }

  return NextResponse.json({
    authenticated: true,
    isAdmin: isAdminEmail(session.email),
    suspended: session.suspended,
    email: session.email,
    profile: session.profile,
  });
}