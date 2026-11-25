import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/authSession";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, profile: null });
  }

  return NextResponse.json({
    authenticated: true,
    suspended: session.suspended,
    email: session.email,
    profile: session.profile,
  });
}