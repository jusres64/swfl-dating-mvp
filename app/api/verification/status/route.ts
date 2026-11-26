import { NextResponse } from "next/server";
import {
  getAuthenticatedSession,
  isLocationVerificationFresh,
  isVerificationGateComplete,
} from "@/lib/authSession";
import { getSupabaseService } from "@/lib/supabaseService";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const supabase = getSupabaseService();
    const p = session.profile;
    const rawPaths = Array.isArray(p.photo_urls) ? p.photo_urls : [];

    const vaultPhotos: Array<{ path: string; url: string }> = [];
    for (const path of rawPaths) {
      const { data } = await supabase.storage.from("vault-media").createSignedUrl(path, 3600);
      if (data?.signedUrl) {
        vaultPhotos.push({ path, url: data.signedUrl });
      }
    }

    let selfieUrl: string | null = null;
    if (p.selfie_path) {
      const { data } = await supabase.storage
        .from("vault-media")
        .createSignedUrl(p.selfie_path, 3600);
      selfieUrl = data?.signedUrl || null;
    }

    return NextResponse.json({
      profile: p,
      locationFresh: isLocationVerificationFresh(p),
      gateComplete: isVerificationGateComplete(p),
      vaultPhotos,
      selfieUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load verification status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}