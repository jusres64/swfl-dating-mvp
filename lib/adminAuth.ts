import { getAuthenticatedSession } from "@/lib/authSession";
import { getSupabaseService } from "@/lib/supabaseService";

const DEFAULT_ADMIN_EMAILS = "jusres@hotmail.com";

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  const rawList = process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS;
  const allowed = rawList
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(clean);
}

export async function requireAdminSession(): Promise<{
  userId: string;
  email: string;
} | null> {
  const session = await getAuthenticatedSession();
  if (!session) return null;

  let email = session.email;
  if (!email) {
    const supabase = getSupabaseService();
    const { data } = await supabase.auth.admin.getUserById(session.userId);
    email = data.user?.email || "";
  }

  if (!isAdminEmail(email)) return null;
  return { userId: session.userId, email };
}