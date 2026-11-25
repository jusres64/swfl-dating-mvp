import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseService, normalizeIdentity } from "@/lib/supabaseService";

export const SESSION_COOKIE_NAME = "cd_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export interface AuthProfile {
  id: string;
  gender: "man" | "woman";
  cohort_status: string;
  display_name: string;
  birth_year: number;
  area_label: string;
  approx_lat: number;
  approx_lng: number;
  intent: string;
  intents: string[] | null;
  min_age_pref: number;
  max_age_pref: number;
  max_drive_miles: number;
  wants_kids: string | null;
  partner_kids_pref: string | null;
  smoking: string | null;
  occupation: string | null;
  height_inches: number | null;
  bio_prompts: Array<{ question?: string; answer?: string }> | null;
}

function getSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.LIVEKIT_API_SECRET;
  if (!secret) {
    throw new Error("Missing server signing secret");
  }
  return secret;
}

export function createSessionToken(userId: string, email: string): string {
  const payload = {
    uid: userId,
    email: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): { uid: string; email: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac("sha256", getSecret()).update(encoded).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      uid?: string;
      email?: string;
      exp?: number;
    };
    if (!parsed.uid || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { uid: parsed.uid, email: parsed.email || "" };
  } catch {
    return null;
  }
}

export function attachSessionCookie(res: NextResponse, userId: string, email: string) {
  const token = createSessionToken(userId, email);
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getAuthenticatedSession(): Promise<{
  userId: string;
  email: string;
  profile: AuthProfile;
  suspended: boolean;
} | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!raw) return null;

    const verified = verifySessionToken(raw);
    if (!verified) return null;

    const supabase = getSupabaseService();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "id, gender, cohort_status, display_name, birth_year, area_label, approx_lat, approx_lng, intent, intents, min_age_pref, max_age_pref, max_drive_miles, wants_kids, partner_kids_pref, smoking, occupation, height_inches, bio_prompts"
      )
      .eq("id", verified.uid)
      .maybeSingle();

    if (error || !profile) return null;

    const checks = [verified.uid.toLowerCase(), normalizeIdentity(profile.display_name)];
    const { data: suspendedRows } = await supabase
      .from("suspended_identities")
      .select("identity")
      .in("identity", checks);

    const suspended =
      profile.cohort_status === "banned" || Boolean(suspendedRows && suspendedRows.length > 0);

    return {
      userId: verified.uid,
      email: verified.email,
      profile: profile as AuthProfile,
      suspended,
    };
  } catch {
    return null;
  }
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}