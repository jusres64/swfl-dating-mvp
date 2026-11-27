"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { EditableUserProfile } from "./EditPreferencesView";

export type VerificationProfile = EditableUserProfile & {
  photo_urls?: string[] | null;
  selfie_path?: string | null;
  photo_verification_status?: string | null;
  location_verified?: boolean | null;
  location_verified_at?: string | null;
  location_ip_flag?: string | null;
};

type SignedPhoto = { path: string; url: string };

type Props = {
  profile: VerificationProfile;
  onBack: () => void;
  onProfileUpdated: (updated: VerificationProfile) => void;
};

function compressImageFile(file: File, maxDimension = 1080, quality = 0.82): Promise<File> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(new File([blob], "vault-photo.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image file."));
    };
    img.src = objectUrl;
  });
}

function isLocationFreshClient(p: VerificationProfile): boolean {
  if (!p.location_verified || !p.location_verified_at) return false;
  const ms = new Date(p.location_verified_at).getTime();
  if (isNaN(ms)) return false;
  return Date.now() - ms <= 14 * 24 * 60 * 60 * 1000;
}

export default function VerificationGateView({ profile, onBack, onProfileUpdated }: Props) {
  const [localProfile, setLocalProfile] = useState<VerificationProfile>(profile);
  const [vaultPhotos, setVaultPhotos] = useState<SignedPhoto[]>([]);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const [locBusy, setLocBusy] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProgress, setPhotoProgress] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [cameraOpening, setCameraOpening] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selfieBusy, setSelfieBusy] = useState(false);
  const [selfieError, setSelfieError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraContainerRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onProfileUpdatedRef = useRef(onProfileUpdated);

  useEffect(() => {
    onProfileUpdatedRef.current = onProfileUpdated;
  }, [onProfileUpdated]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  }, []);

  // Load verification status once on mount (never restarts on parent re-renders)
  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const res = await fetch("/api/verification/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          profile?: VerificationProfile;
          vaultPhotos?: SignedPhoto[];
          selfieUrl?: string | null;
        };
        if (!active) return;
        if (data.profile) {
          setLocalProfile(data.profile);
          onProfileUpdatedRef.current(data.profile);
        }
        setVaultPhotos(data.vaultPhotos || []);
        setSelfieUrl(data.selfieUrl || null);
      } finally {
        if (active) setLoadingInitial(false);
      }
    };
    loadStatus();
    return () => {
      active = false;
    };
  }, []);

  // Only stop the camera stream when leaving the Verification Gate screen
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
      cameraContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [cameraOpen]);

  // 1. One-tap SWFL GPS + Vercel IP check
  const handleVerifyLocation = () => {
    setLocError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocError("Location services are not supported in this browser.");
      return;
    }

    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch("/api/verification/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            profile?: VerificationProfile;
            error?: string;
          };
          if (!res.ok || !data.profile) {
            setLocError(data.error || "Location verification failed.");
            return;
          }
          setLocalProfile(data.profile);
          onProfileUpdatedRef.current(data.profile);
        } catch {
          setLocError("Network error while verifying your SWFL location.");
        } finally {
          setLocBusy(false);
        }
      },
      (geoErr) => {
        setLocBusy(false);
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          setLocError(
            "Location access was denied. Tap the tune/lock icon in Chrome's address bar -> Permissions -> Location -> Allow, then try again."
          );
        } else if (geoErr.code === geoErr.TIMEOUT) {
          setLocError("Location lookup timed out. Step near a window or check GPS is enabled, then try again.");
        } else {
          setLocError("Could not detect your location. Please check your phone's GPS setting.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  // 2. Batch-upload Vault Photos (select 1 to 3 at once)
  const handleUploadVaultPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (selectedFiles.length === 0) return;

    const currentCount = Array.isArray(localProfile.photo_urls)
      ? localProfile.photo_urls.length
      : 0;
    const remainingSlots = Math.max(0, 3 - currentCount);
    if (remainingSlots === 0) {
      setPhotoError("You already have 3 Vault photos. Remove one first to add another.");
      return;
    }

    const toUpload = selectedFiles.slice(0, remainingSlots);
    const trimmedExtra = selectedFiles.length > remainingSlots;

    setPhotoError(null);
    setPhotoBusy(true);
    try {
      for (let i = 0; i < toUpload.length; i++) {
        setPhotoProgress(
          toUpload.length > 1
            ? `Uploading ${i + 1} of ${toUpload.length}...`
            : "Uploading Photo..."
        );
        const compressed = await compressImageFile(toUpload[i]);
        const fd = new FormData();
        fd.append("kind", "vault");
        fd.append("file", compressed);

        const res = await fetch("/api/verification/photos", {
          method: "POST",
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as {
          profile?: VerificationProfile;
          vaultPhotos?: SignedPhoto[];
          selfieUrl?: string | null;
          error?: string;
        };
        if (!res.ok || !data.profile) {
          setPhotoError(data.error || `Could not upload photo ${i + 1}.`);
          break;
        }
        setLocalProfile(data.profile);
        onProfileUpdatedRef.current(data.profile);
        setVaultPhotos(data.vaultPhotos || []);
      }

      if (trimmedExtra) {
        setPhotoError(
          `Uploaded the first ${remainingSlots} photo${remainingSlots === 1 ? "" : "s"} (Vault max is 3).`
        );
      }
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setPhotoBusy(false);
      setPhotoProgress(null);
    }
  };

  const handleDeleteVaultPhoto = async (path: string) => {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const res = await fetch("/api/verification/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        profile?: VerificationProfile;
        vaultPhotos?: SignedPhoto[];
        error?: string;
      };
      if (!res.ok || !data.profile) {
        setPhotoError(data.error || "Could not remove photo.");
        return;
      }
      setLocalProfile(data.profile);
      onProfileUpdatedRef.current(data.profile);
      setVaultPhotos(data.vaultPhotos || []);
    } finally {
      setPhotoBusy(false);
    }
  };

  // 3. Live Front-Camera Selfie Capture (No gallery picker)
  const handleOpenSelfieCamera = async () => {
    setSelfieError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSelfieError("Live camera capture is not supported in this browser.");
      return;
    }
    setCameraOpening(true);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setSelfieError(
        "Camera permission denied or unavailable. Allow camera access in Chrome and tap Open Live Camera again."
      );
    } finally {
      setCameraOpening(false);
    }
  };

  const handleCaptureSelfie = async () => {
    const videoEl = videoRef.current;
    if (!videoEl || videoEl.videoWidth === 0) {
      setSelfieError("Camera is still warming up. Wait a moment and tap Capture again.");
      return;
    }

    setSelfieBusy(true);
    setSelfieError(null);
    try {
      const canvas = document.createElement("canvas");
      const maxDim = 900;
      const scale = Math.min(1, maxDim / Math.max(videoEl.videoWidth, videoEl.videoHeight));
      canvas.width = Math.max(1, Math.round(videoEl.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(videoEl.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not initialize camera capture.");

      // Un-mirror when saving so admin compares naturally
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85)
      );
      if (!blob) throw new Error("Failed to capture selfie image.");

      const selfieFile = new File([blob], "live-selfie.jpg", { type: "image/jpeg" });
      const fd = new FormData();
      fd.append("kind", "selfie");
      fd.append("file", selfieFile);

      const res = await fetch("/api/verification/photos", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        profile?: VerificationProfile;
        selfieUrl?: string | null;
        error?: string;
      };
      if (!res.ok || !data.profile) {
        setSelfieError(data.error || "Could not upload live selfie.");
        return;
      }
      stopCamera();
      setLocalProfile(data.profile);
      onProfileUpdatedRef.current(data.profile);
      setSelfieUrl(data.selfieUrl || null);
    } catch (err) {
      setSelfieError(err instanceof Error ? err.message : "Live selfie capture failed.");
    } finally {
      setSelfieBusy(false);
    }
  };

  const locOk = isLocationFreshClient(localProfile);
  const photosCount = Array.isArray(localProfile.photo_urls) ? localProfile.photo_urls.length : 0;
  const photosOk = photosCount >= 1;
  const remainingSlots = Math.max(0, 3 - photosCount);
  const selfieOk =
    Boolean(localProfile.selfie_path) && localProfile.photo_verification_status !== "rejected";
  const allComplete = locOk && photosOk && selfieOk;

  return (
    <main className="min-h-[100dvh] bg-[#0E0B0D] text-[#F5EDE2] flex items-start justify-center p-4">
      <div className="w-full max-w-md space-y-4 py-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onBack();
            }}
            className="min-h-[44px] px-3 rounded-xl border border-[#F0E2CC]/15 bg-[#171215] text-xs font-medium text-[#E6DACB] hover:bg-[#241C20]"
          >
            &larr; Back to Green Room
          </button>
          <span className="text-xs font-medium text-[#E5C17B]">
            {[locOk, photosOk, selfieOk].filter(Boolean).length} of 3 Complete
          </span>
        </div>

        <div className="rounded-3xl border border-[#F0E2CC]/18 bg-[#171215] p-6 shadow-2xl space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E5C17B]">
              Cohort 01 Verification Gate
            </p>
            <h1 className="mt-1 font-serif text-2xl font-medium text-[#F8F1E7]">
              Verify once, keep it local
            </h1>
            <p className="mt-1 text-xs text-[#A89A90] leading-relaxed">
              Every member completes these 3 quick checks before joining a live Drop. Your photos stay completely hidden until a mutual post-call match.
            </p>
          </div>

          {loadingInitial ? (
            <p className="text-xs text-[#A89A90]">Loading verification status...</p>
          ) : (
            <div className="space-y-4">
              {/* STEP 1: SWFL GPS + VERCEL IP */}
              <div
                className={`rounded-2xl border p-4 space-y-2.5 ${
                  locOk
                    ? "border-[#7A9E7E]/45 bg-[#161E18]"
                    : "border-[#F0E2CC]/15 bg-[#110D10]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#F8F1E7]">1. SWFL Location Check</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      locOk
                        ? "bg-[#7A9E7E]/20 text-[#9AC19E]"
                        : "bg-[#2A221A] text-[#E5C17B]"
                    }`}
                  >
                    {locOk ? "Verified Local" : "Required"}
                  </span>
                </div>

                <p className="text-xs text-[#B3A499] leading-relaxed">
                  Confirms you are currently inside Southwest Florida (Manatee through Collier). Exact GPS coordinates are checked in memory and immediately discarded.
                </p>

                {locError && (
                  <div className="rounded-xl border border-[#8E434F] bg-[#31171C] px-3 py-2 text-xs text-[#F4C4CB]">
                    {locError}
                  </div>
                )}

                <button
                  type="button"
                  disabled={locBusy}
                  onClick={handleVerifyLocation}
                  className={`w-full min-h-[44px] rounded-xl text-xs font-semibold transition disabled:opacity-60 ${
                    locOk
                      ? "border border-[#7A9E7E]/40 bg-[#1D2820] text-[#B8D9BC] hover:bg-[#253329]"
                      : "bg-[#E5C17B] text-[#1A1310] hover:bg-[#EED093]"
                  }`}
                >
                  {locBusy
                    ? "Checking SWFL Location..."
                    : locOk
                    ? "SWFL Location Verified (Re-check)"
                    : "Verify My SWFL Location"}
                </button>
              </div>

              {/* STEP 2: VAULT PHOTOS (1 TO 3, MULTI-SELECT ENABLED) */}
              <div
                className={`rounded-2xl border p-4 space-y-3 ${
                  photosOk
                    ? "border-[#7A9E7E]/45 bg-[#161E18]"
                    : "border-[#F0E2CC]/15 bg-[#110D10]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#F8F1E7]">
                    2. Private Vault Photos ({photosCount}/3)
                  </p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      photosOk
                        ? "bg-[#7A9E7E]/20 text-[#9AC19E]"
                        : "bg-[#2A221A] text-[#E5C17B]"
                    }`}
                  >
                    {photosOk ? "Ready" : "Add 1 to 3"}
                  </span>
                </div>

                <p className="text-xs text-[#B3A499] leading-relaxed">
                  Select 1 to 3 clear photos of yourself (you can pick multiple at once). Nobody can browse them; they only unlock inside chat after you and a match both say yes.
                </p>

                {photoError && (
                  <div className="rounded-xl border border-[#8E434F] bg-[#31171C] px-3 py-2 text-xs text-[#F4C4CB]">
                    {photoError}
                  </div>
                )}

                {vaultPhotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {vaultPhotos.map((item) => (
                      <div
                        key={item.path}
                        className="relative aspect-[3/4] overflow-hidden rounded-xl border border-[#F0E2CC]/20 bg-black"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.url}
                          alt="Your Vault photo"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          disabled={photoBusy}
                          onClick={() => handleDeleteVaultPhoto(item.path)}
                          className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/75 text-xs font-bold text-[#F4C4CB] hover:bg-[#7A2835]"
                          aria-label="Remove photo"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {photosCount < 3 && (
                  <label className="block w-full">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={photoBusy}
                      onChange={handleUploadVaultPhotos}
                      className="hidden"
                    />
                    <span className="flex w-full min-h-[44px] items-center justify-center rounded-xl border border-[#E5C17B]/45 bg-[#251E18] text-xs font-semibold text-[#F0D9AE] hover:bg-[#31271F] cursor-pointer transition">
                      {photoBusy
                        ? photoProgress || "Uploading Photo..."
                        : photosCount === 0
                        ? "Select 1–3 Vault Photos"
                        : remainingSlots === 1
                        ? `Add Final Photo (${photosCount}/3)`
                        : `Add up to ${remainingSlots} More Photos (${photosCount}/3)`}
                    </span>
                  </label>
                )}
              </div>

              {/* STEP 3: LIVE CAMERA SELFIE */}
              <div
                className={`rounded-2xl border p-4 space-y-3 ${
                  selfieOk
                    ? "border-[#7A9E7E]/45 bg-[#161E18]"
                    : "border-[#F0E2CC]/15 bg-[#110D10]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#F8F1E7]">3. Live Camera Selfie</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      localProfile.photo_verification_status === "verified"
                        ? "bg-[#7A9E7E]/25 text-[#9AC19E]"
                        : selfieOk
                        ? "bg-[#E5C17B]/20 text-[#E5C17B]"
                        : "bg-[#2A221A] text-[#E5C17B]"
                    }`}
                  >
                    {localProfile.photo_verification_status === "verified"
                      ? "Photo Verified"
                      : selfieOk
                      ? "Submitted"
                      : "Required"}
                  </span>
                </div>

                <p className="text-xs text-[#B3A499] leading-relaxed">
                  Snap one live front-camera selfie to prove your Vault photos match the real you. Only our team sees this selfie for verification.
                </p>

                {localProfile.photo_verification_status === "rejected" && (
                  <div className="rounded-xl border border-[#8E434F] bg-[#31171C] px-3 py-2 text-xs text-[#F4C4CB]">
                    Your previous selfie was not clear enough to match your Vault photos. Please retake in good lighting.
                  </div>
                )}

                {selfieError && (
                  <div className="rounded-xl border border-[#8E434F] bg-[#31171C] px-3 py-2 text-xs text-[#F4C4CB]">
                    {selfieError}
                  </div>
                )}

                {cameraOpen ? (
                  <div ref={cameraContainerRef} className="space-y-2.5">
                    <div className="relative aspect-[3/4] w-full max-w-[240px] mx-auto overflow-hidden rounded-2xl border border-[#E5C17B]/40 bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-full w-full object-cover scale-x-[-1]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={selfieBusy}
                        onClick={stopCamera}
                        className="w-1/3 min-h-[44px] rounded-xl border border-[#F0E2CC]/20 bg-[#1F191C] text-xs font-medium text-[#DDD0C2]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={selfieBusy}
                        onClick={handleCaptureSelfie}
                        className="flex-1 min-h-[44px] rounded-xl bg-[#E5C17B] text-xs font-semibold text-[#1A1310] hover:bg-[#EED093] disabled:opacity-60"
                      >
                        {selfieBusy ? "Saving Selfie..." : "Capture Live Selfie"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selfieUrl && selfieOk && (
                      <div className="flex items-center gap-3 rounded-xl border border-[#F0E2CC]/12 bg-[#141013] p-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selfieUrl}
                          alt="Your verification selfie"
                          className="h-14 w-14 rounded-lg object-cover border border-[#F0E2CC]/20"
                        />
                        <div className="text-xs">
                          <p className="font-medium text-[#F8F1E7]">
                            {localProfile.photo_verification_status === "verified"
                              ? "Photo Verified badge active"
                              : "Selfie saved for review"}
                          </p>
                          <p className="text-[11px] text-[#A89A90]">
                            Private to moderation, never shown to matches.
                          </p>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={cameraOpening}
                      onClick={handleOpenSelfieCamera}
                      className={`w-full min-h-[44px] rounded-xl text-xs font-semibold transition disabled:opacity-60 ${
                        selfieOk
                          ? "border border-[#F0E2CC]/20 bg-[#1F191C] text-[#DDD0C2] hover:bg-[#2B2327]"
                          : "bg-[#E5C17B] text-[#1A1310] hover:bg-[#EED093]"
                      }`}
                    >
                      {cameraOpening
                        ? "Opening Camera..."
                        : selfieOk
                        ? "Retake Live Selfie"
                        : "Open Live Camera"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              stopCamera();
              onBack();
            }}
            className={`w-full min-h-[48px] rounded-2xl text-sm font-semibold transition ${
              allComplete
                ? "bg-[#E5C17B] text-[#1A1310] hover:bg-[#EED093]"
                : "border border-[#F0E2CC]/20 bg-[#1F191C] text-[#DDD0C2] hover:bg-[#2B2327]"
            }`}
          >
            {allComplete ? "All Set, Return to Green Room" : "Back to Green Room"}
          </button>
        </div>
      </div>
    </main>
  );
}