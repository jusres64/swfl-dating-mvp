import crypto from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedSession, PROFILE_SELECT_FIELDS } from "@/lib/authSession";
import { getSupabaseService } from "@/lib/supabaseService";

const MAX_VAULT_PHOTOS = 3;
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

async function buildSignedPayload(userId: string) {
  const supabase = getSupabaseService();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FIELDS)
    .eq("id", userId)
    .single();

  if (error || !profile) {
    throw new Error(error?.message || "Could not reload profile.");
  }

  const rawPaths = Array.isArray(profile.photo_urls) ? profile.photo_urls : [];
  const vaultPhotos: Array<{ path: string; url: string }> = [];
  for (const path of rawPaths) {
    const { data } = await supabase.storage.from("vault-media").createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      vaultPhotos.push({ path, url: data.signedUrl });
    }
  }

  let selfieUrl: string | null = null;
  if (profile.selfie_path) {
    const { data } = await supabase.storage
      .from("vault-media")
      .createSignedUrl(profile.selfie_path, 3600);
    selfieUrl = data?.signedUrl || null;
  }

  return { profile, vaultPhotos, selfieUrl };
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }
    if (session.suspended) {
      return NextResponse.json(
        { error: "This account has been suspended pending safety review." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const kind = String(formData.get("kind") || "");
    const file = formData.get("file");

    if (kind !== "vault" && kind !== "selfie") {
      return NextResponse.json({ error: "Invalid upload type." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: "Please upload a JPEG, PNG, or WebP photo." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image is too large (max 3 MB). Please try another photo." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseService();
    const currentPhotos = Array.isArray(session.profile.photo_urls)
      ? session.profile.photo_urls
      : [];

    if (kind === "vault" && currentPhotos.length >= MAX_VAULT_PHOTOS) {
      return NextResponse.json(
        { error: `You can store up to ${MAX_VAULT_PHOTOS} Vault photos. Delete one first to add another.` },
        { status: 400 }
      );
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const fileId = crypto.randomUUID().slice(0, 12);
    const storagePath =
      kind === "vault"
        ? `vault/${session.userId}/${Date.now()}-${fileId}.${ext}`
        : `selfies/${session.userId}/${Date.now()}-${fileId}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await supabase.storage
      .from("vault-media")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    if (kind === "vault") {
      const nextPhotos = [...currentPhotos, storagePath];
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ photo_urls: nextPhotos })
        .eq("id", session.userId);

      if (dbErr) {
        return NextResponse.json({ error: dbErr.message }, { status: 500 });
      }
    } else {
      if (session.profile.selfie_path) {
        await supabase.storage
          .from("vault-media")
          .remove([session.profile.selfie_path])
          .catch(() => {});
      }

      const { error: dbErr } = await supabase
        .from("profiles")
        .update({
          selfie_path: storagePath,
          liveness_checked: true,
          photo_verification_status: "pending",
        })
        .eq("id", session.userId);

      if (dbErr) {
        return NextResponse.json({ error: dbErr.message }, { status: 500 });
      }
    }

    const payload = await buildSignedPayload(session.userId);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Photo upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const body = (await request.json()) as { path?: string };
    const targetPath = (body.path || "").trim();
    const expectedPrefix = `vault/${session.userId}/`;

    if (!targetPath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Not authorized to delete this photo." }, { status: 403 });
    }

    const supabase = getSupabaseService();
    await supabase.storage.from("vault-media").remove([targetPath]).catch(() => {});

    const currentPhotos = Array.isArray(session.profile.photo_urls)
      ? session.profile.photo_urls
      : [];
    const nextPhotos = currentPhotos.filter((p) => p !== targetPath);

    const { error: dbErr } = await supabase
      .from("profiles")
      .update({ photo_urls: nextPhotos })
      .eq("id", session.userId);

    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    const payload = await buildSignedPayload(session.userId);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete photo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}