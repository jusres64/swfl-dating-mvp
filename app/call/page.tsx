"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import EditPreferencesModal from "@/components/EditPreferencesModal";
import {
  ConnectionQuality,
  ConnectionState,
  createLocalVideoTrack,
  LocalVideoTrack,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  TrackPublication,
} from "livekit-client";

type WakeLockSentinelLike = {
  release: () => Promise<void>;
};

type ViewMode = "greenroom" | "call" | "post-call" | "chat";
type PipCorner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

type SignalMessage =
  | { type: "video_request" }
  | { type: "video_cancel" }
  | { type: "video_decline" }
  | { type: "spark_index"; index: number };

type UserProfile = {
  id: string;
  gender: "man" | "woman";
  cohort_status: string;
  display_name: string;
  birth_year: number;
  area_label: string;
  intent: string;
  kids?: string;
  min_age_pref: number;
  max_age_pref: number;
  max_drive_miles: number;
  smoking: string | null;
  occupation: string | null;
  intents?: string[] | null;
  wants_kids?: string | null;
  partner_kids_pref?: string | null;
  bio_prompts?: Array<{ question?: string; answer?: string }> | null;
};

type MatchRecord = {
  id: string;
  room_name: string;
  user_a: string;
  user_b: string;
  user_a_display: string;
  user_b_display: string;
  status: string;
  created_at: string;
};

type PartnerVaultProfile = {
  displayName: string;
  age: number | null;
  areaLabel: string;
  occupation: string;
  height: string;
  smoking: string;
  intent: string;
  kids?: string;
  firstMeetSpot: string;
};

type ChatMessage = {
  id: string;
  match_id: string;
  sender_identity: string;
  sender_display: string;
  body: string;
  created_at: string;
};

const SPARK_WORDS: string[] = [
  "Canoe",
  "Kangaroo",
  "Lighthouse",
  "Hammock",
  "Pineapple",
  "Compass",
  "Velvet",
  "Flamingo",
  "Campfire",
  "Telescope",
  "Driftwood",
  "Espresso",
  "Submarine",
  "Firefly",
  "Monsoon",
  "Vinyl",
  "Sourdough",
  "Origami",
  "Gondola",
  "Cactus",
  "Trampoline",
  "Meteor",
  "Accordion",
  "Sandbar",
];

const REPORT_REASONS = [
  "Inappropriate behavior or comments",
  "Harassment or disrespect",
  "Fake profile or spam",
  "Just felt uncomfortable",
];

function triggerHaptic(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore unsupported browsers
    }
  }
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function CallPage() {
  // Auth state
  const [authChecking, setAuthChecking] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Navigation & queue state
  const [viewMode, setViewMode] = useState<ViewMode>("greenroom");
  const [inQueue, setInQueue] = useState(false);
  const [queueWaitSeconds, setQueueWaitSeconds] = useState(0);
  const [waitingCount, setWaitingCount] = useState(1);
  const [allowRematch, setAllowRematch] = useState(true);
  const [showManualRoom, setShowManualRoom] = useState(false);
  const [showEditPrefs, setShowEditPrefs] = useState(false);
  const [manualRoomCode, setManualRoomCode] = useState("coastal-dusk-test");
  const [joining, setJoining] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [endedNotice, setEndedNotice] = useState<string | null>(null);

  // Active call state
  const [activeRoomName, setActiveRoomName] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [signalQuality, setSignalQuality] = useState<ConnectionQuality>(
    ConnectionQuality.Unknown
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Local & partner media
  const [isMuted, setIsMuted] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [partnerArea, setPartnerArea] = useState<string | null>(null);
  const [partnerMuted, setPartnerMuted] = useState(false);
  const [partnerVideoTrack, setPartnerVideoTrack] = useState<RemoteTrack | null>(null);
  const [localLiveVideoTrack, setLocalLiveVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [localCameraHidden, setLocalCameraHidden] = useState(false);

  // Preview Cam + Lighting Check + Soft Screen Light
  const [previewTrack, setPreviewTrack] = useState<LocalVideoTrack | null>(null);
  const [isLightingDark, setIsLightingDark] = useState(false);
  const [softLightOn, setSoftLightOn] = useState(false);

  // Draggable FaceTime-style Self-View PiP
  const [pipCorner, setPipCorner] = useState<PipCorner>("top-right");
  const [pipDragPos, setPipDragPos] = useState<{ left: number; top: number } | null>(null);

  // Mutual Video Consent
  const [videoRequestedByMe, setVideoRequestedByMe] = useState(false);
  const [videoRequestedByPartner, setVideoRequestedByPartner] = useState(false);
  const [videoUnlocked, setVideoUnlocked] = useState(false);

  // 3-Second Spark
  const [sparkIndex, setSparkIndex] = useState(0);
  const [sparkVisible, setSparkVisible] = useState(true);

  // Post-call Like / Pass & Match state
  const [postCallPartnerId, setPostCallPartnerId] = useState<string | null>(null);
  const [postCallPartnerName, setPostCallPartnerName] = useState<string | null>(null);
  const [postCallRoom, setPostCallRoom] = useState<string>("");
  const [myDecision, setMyDecision] = useState<"none" | "like" | "pass">("none");
  const [waitingForMutual, setWaitingForMutual] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);

  // Matches & Chat state
  const [myMatches, setMyMatches] = useState<MatchRecord[]>([]);
  const [activeMatch, setActiveMatch] = useState<MatchRecord | null>(null);
  const [partnerVault, setPartnerVault] = useState<PartnerVaultProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [showMatchProfileCard, setShowMatchProfileCard] = useState(true);

  // Safety & Report sheet
  const [showSafetySheet, setShowSafetySheet] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  // Refs
  const roomRef = useRef<Room | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const pipRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const dragMetaRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const videoReqMeRef = useRef(false);
  const previewTrackRef = useRef<LocalVideoTrack | null>(null);
  const lastPartnerIdRef = useRef<string | null>(null);
  const lastPartnerNameRef = useRef<string | null>(null);
  const connectingLockRef = useRef(false);

  useEffect(() => {
    videoReqMeRef.current = videoRequestedByMe;
  }, [videoRequestedByMe]);

  useEffect(() => {
    previewTrackRef.current = previewTrack;
  }, [previewTrack]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const sendSignal = useCallback(async (payload: SignalMessage) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    try {
      const encoded = new TextEncoder().encode(JSON.stringify(payload));
      await room.localParticipant.publishData(encoded, { reliable: true });
    } catch {
      // Ignore transient data errors
    }
  }, []);

  // Load authenticated user session on mount
  const refreshSession = useCallback(async () => {
    setAuthChecking(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await res.json()) as {
        authenticated?: boolean;
        suspended?: boolean;
        profile?: UserProfile | null;
      };
      if (data.authenticated && data.profile) {
        if (data.suspended) {
          setUserProfile(null);
          setLoginError("This account has been suspended pending safety review.");
        } else {
          setUserProfile(data.profile);
        }
      } else {
        setUserProfile(null);
      }
    } catch {
      setUserProfile(null);
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const loadMyMatches = useCallback(async () => {
    if (!userProfile) {
      setMyMatches([]);
      return;
    }
    try {
      const res = await fetch(`/api/messages?identity=${encodeURIComponent(userProfile.id)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { matches?: MatchRecord[] };
      setMyMatches(data.matches || []);
    } catch {
      // Ignore transient hiccups
    }
  }, [userProfile]);

  useEffect(() => {
    if (viewMode === "greenroom" && userProfile) {
      loadMyMatches();
    }
  }, [viewMode, userProfile, loadMyMatches]);

  // Sign in handler
  const handleInlineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        profile?: UserProfile;
      };
      if (!res.ok) {
        setLoginError(data.error || "Sign in failed.");
        return;
      }
      if (data.profile) {
        setUserProfile(data.profile);
        setLoginPassword("");
      } else {
        await refreshSession();
      }
    } catch {
      setLoginError("Network error. Please try again.");
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    setInQueue(false);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUserProfile(null);
    setMyMatches([]);
    setEndedNotice(null);
  };

  // Wake Lock during live call
  const requestWakeLock = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    const navWithWakeLock = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    if (!navWithWakeLock.wakeLock) return;
    try {
      wakeLockRef.current = await navWithWakeLock.wakeLock.request("screen");
    } catch {
      // Ignore if battery saver blocks wake lock
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Already released
      }
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (viewMode !== "call") return;
    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && viewMode === "call") {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }, [viewMode, requestWakeLock, releaseWakeLock]);

  // Timers
  useEffect(() => {
    if (viewMode !== "call") {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [viewMode]);

  useEffect(() => {
    if (!inQueue) {
      setQueueWaitSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setQueueWaitSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [inQueue]);

  // Stop local preview cleanly before enabling live camera
  const stopPreviewTrack = useCallback(() => {
    if (previewTrackRef.current) {
      previewTrackRef.current.stop();
      previewTrackRef.current = null;
      setPreviewTrack(null);
      setIsLightingDark(false);
    }
  }, []);

  const unlockLiveVideo = useCallback(async () => {
    setVideoUnlocked(true);
    setVideoRequestedByMe(false);
    setVideoRequestedByPartner(false);
    stopPreviewTrack();

    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(true);
      setLocalCameraHidden(false);
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.videoTrack) {
        setLocalLiveVideoTrack(camPub.videoTrack as LocalVideoTrack);
      }
    } catch {
      showToast("Could not start camera. Check browser camera permissions.");
    }
  }, [stopPreviewTrack, showToast]);

  // Attach remote & local video
  useEffect(() => {
    const videoEl = remoteVideoRef.current;
    if (!videoEl || !partnerVideoTrack) return;
    partnerVideoTrack.attach(videoEl);
    return () => {
      partnerVideoTrack.detach(videoEl);
    };
  }, [partnerVideoTrack, videoUnlocked]);

  const activeLocalVideoTrack = videoUnlocked ? localLiveVideoTrack : previewTrack;
  useEffect(() => {
    const videoEl = localVideoRef.current;
    if (!videoEl || !activeLocalVideoTrack) return;
    activeLocalVideoTrack.attach(videoEl);
    return () => {
      activeLocalVideoTrack.detach(videoEl);
    };
  }, [activeLocalVideoTrack, localCameraHidden]);

  // Darkness check
  useEffect(() => {
    if (!activeLocalVideoTrack || localCameraHidden) {
      setIsLightingDark(false);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 36;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const checkBrightness = () => {
      const videoEl = localVideoRef.current;
      if (!ctx || !videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) return;
      try {
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let lumaSum = 0;
        const pixelCount = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          lumaSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        setIsLightingDark(lumaSum / pixelCount < 62);
      } catch {
        // Ignore frame read errors
      }
    };

    const initialTimer = setTimeout(checkBrightness, 900);
    const interval = setInterval(checkBrightness, 2000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [activeLocalVideoTrack, localCameraHidden]);

  // Draggable PiP handlers
  const handlePipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const stageEl = stageRef.current;
    const pipEl = pipRef.current;
    if (!stageEl || !pipEl) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const stageRect = stageEl.getBoundingClientRect();
    const pipRect = pipEl.getBoundingClientRect();

    dragMetaRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - pipRect.left,
      offsetY: e.clientY - pipRect.top,
      width: pipRect.width,
      height: pipRect.height,
    };

    setPipDragPos({
      left: pipRect.left - stageRect.left,
      top: pipRect.top - stageRect.top,
    });
  };

  const handlePipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const meta = dragMetaRef.current;
    const stageEl = stageRef.current;
    if (!meta || meta.pointerId !== e.pointerId || !stageEl) return;

    const stageRect = stageEl.getBoundingClientRect();
    const pad = 10;
    const rawLeft = e.clientX - stageRect.left - meta.offsetX;
    const rawTop = e.clientY - stageRect.top - meta.offsetY;

    const maxLeft = Math.max(pad, stageRect.width - meta.width - pad);
    const maxTop = Math.max(pad, stageRect.height - meta.height - pad);

    setPipDragPos({
      left: Math.min(Math.max(rawLeft, pad), maxLeft),
      top: Math.min(Math.max(rawTop, pad), maxTop),
    });
  };

  const handlePipPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const meta = dragMetaRef.current;
    const stageEl = stageRef.current;
    if (!meta || meta.pointerId !== e.pointerId) return;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (stageEl && pipDragPos) {
      const stageRect = stageEl.getBoundingClientRect();
      const centerX = pipDragPos.left + meta.width / 2;
      const centerY = pipDragPos.top + meta.height / 2;
      const isLeft = centerX < stageRect.width / 2;
      const isTop = centerY < stageRect.height / 2;

      const nextCorner: PipCorner = isTop
        ? isLeft
          ? "top-left"
          : "top-right"
        : isLeft
        ? "bottom-left"
        : "bottom-right";

      setPipCorner(nextCorner);
      triggerHaptic(10);
    }

    dragMetaRef.current = null;
    setPipDragPos(null);
  };

  const syncRemoteParticipant = useCallback((participant: RemoteParticipant) => {
    const remoteDisplay = participant.name || participant.identity || "Your Match";
    setPartnerName((prev) => prev || remoteDisplay);
    lastPartnerNameRef.current = lastPartnerNameRef.current || remoteDisplay;
    if (!lastPartnerIdRef.current && participant.identity) {
      lastPartnerIdRef.current = participant.identity;
      setPartnerId((prev) => prev || participant.identity);
    }
    setPartnerMuted(!participant.isMicrophoneEnabled);

    participant.trackPublications.forEach((pub) => {
      if (pub.isSubscribed && pub.track) {
        if (pub.track.kind === Track.Kind.Audio && remoteAudioRef.current) {
          pub.track.attach(remoteAudioRef.current);
        }
        if (pub.track.kind === Track.Kind.Video) {
          setPartnerVideoTrack(pub.track);
          setVideoUnlocked(true);
        }
      }
    });
  }, []);

  const fetchLiveKitToken = async (room: string, name: string, identity: string) => {
    const body = JSON.stringify({
      room,
      roomName: room,
      name,
      participantName: name,
      identity,
    });

    let res = await fetch("/api/calls/test-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (res.status === 405) {
      const qs = new URLSearchParams({
        room,
        roomName: room,
        name,
        participantName: name,
        identity,
      });
      res = await fetch(`/api/calls/test-token?${qs.toString()}`);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `Token request failed (${res.status})`);
    }

    const token: string | undefined = data.token || data.accessToken;
    const serverUrl: string | undefined =
      data.url || data.serverUrl || data.livekitUrl || process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!token || !serverUrl) {
      throw new Error("Missing LiveKit token or NEXT_PUBLIC_LIVEKIT_URL.");
    }
    return { token, serverUrl };
  };

  // Connect into a LiveKit room (called either automatically from Queue or from Manual Test Room)
  const connectToLiveKitRoom = useCallback(
    async (
      targetRoomName: string,
      matchedPartner?: { id: string; displayName: string; areaLabel: string }
    ) => {
      if (!userProfile || connectingLockRef.current) return;
      connectingLockRef.current = true;
      setJoining(true);
      setRoomError(null);
      setEndedNotice(null);

      try {
        const { token, serverUrl } = await fetchLiveKitToken(
          targetRoomName,
          userProfile.display_name,
          userProfile.id
        );

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });
        roomRef.current = room;

        if (matchedPartner) {
          setPartnerId(matchedPartner.id);
          setPartnerName(matchedPartner.displayName);
          setPartnerArea(matchedPartner.areaLabel);
          lastPartnerIdRef.current = matchedPartner.id;
          lastPartnerNameRef.current = matchedPartner.displayName;
        } else {
          setPartnerId(null);
          setPartnerName(null);
          setPartnerArea(null);
          lastPartnerIdRef.current = null;
          lastPartnerNameRef.current = null;
        }

        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          setConnectionState(state);
        });

        room.on(
          RoomEvent.ConnectionQualityChanged,
          (quality: ConnectionQuality, participant: Participant) => {
            if (participant.isLocal) setSignalQuality(quality);
          }
        );

        room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
          syncRemoteParticipant(participant);
          showToast(`${matchedPartner?.displayName || participant.name || "Your match"} connected`);
          if (videoReqMeRef.current) sendSignal({ type: "video_request" });
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          const who = matchedPartner?.displayName || participant.name || "Your match";
          setPartnerMuted(false);
          setPartnerVideoTrack(null);
          setVideoRequestedByPartner(false);
          showToast(`${who} left the call. Tap Leave to decide if you want to match.`);
        });

        room.on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
            syncRemoteParticipant(participant);
            if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
              track.attach(remoteAudioRef.current);
            }
            if (track.kind === Track.Kind.Video) {
              setPartnerVideoTrack(track);
              setVideoUnlocked(true);
            }
          }
        );

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
            track.detach(remoteAudioRef.current);
          }
          if (track.kind === Track.Kind.Video) {
            setPartnerVideoTrack(null);
          }
        });

        room.on(RoomEvent.TrackMuted, (pub: TrackPublication, participant: Participant) => {
          if (pub.source === Track.Source.Microphone) {
            if (participant.isLocal) setIsMuted(true);
            else setPartnerMuted(true);
          }
        });

        room.on(RoomEvent.TrackUnmuted, (pub: TrackPublication, participant: Participant) => {
          if (pub.source === Track.Source.Microphone) {
            if (participant.isLocal) setIsMuted(false);
            else setPartnerMuted(false);
          }
        });

        room.on(RoomEvent.LocalTrackPublished, (pub: TrackPublication) => {
          if (pub.source === Track.Source.Camera && pub.videoTrack) {
            setLocalLiveVideoTrack(pub.videoTrack as LocalVideoTrack);
          }
        });

        room.on(RoomEvent.LocalTrackUnpublished, (pub: TrackPublication) => {
          if (pub.source === Track.Source.Camera) {
            setLocalLiveVideoTrack(null);
          }
        });

        room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
          try {
            const msg = JSON.parse(new TextDecoder().decode(payload)) as SignalMessage;
            const who = matchedPartner?.displayName || participant?.name || "Your match";
            switch (msg.type) {
              case "video_request":
                if (videoReqMeRef.current) {
                  unlockLiveVideo();
                } else {
                  setVideoRequestedByPartner(true);
                  triggerHaptic(25);
                }
                break;
              case "video_cancel":
                setVideoRequestedByPartner(false);
                break;
              case "video_decline":
                setVideoRequestedByMe(false);
                showToast(`${who} prefers to stay voice-only for now.`);
                break;
              case "spark_index":
                setSparkIndex(msg.index % SPARK_WORDS.length);
                setSparkVisible(true);
                break;
            }
          } catch {
            // Ignore non-JSON packets
          }
        });

        await room.connect(serverUrl, token);
        await room.startAudio().catch(() => {});
        await room.localParticipant.setMicrophoneEnabled(true);
        setIsMuted(false);
        setConnectionState(room.state);

        const existingPartners = Array.from(room.remoteParticipants.values());
        if (existingPartners.length > 0) {
          syncRemoteParticipant(existingPartners[0]);
        }

        setActiveRoomName(targetRoomName);
        setPostCallRoom(targetRoomName);
        setInQueue(false);
        setSparkVisible(true);
        setViewMode("call");
        triggerHaptic([20, 40, 20]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to connect to live call.";
        setRoomError(msg);
        setInQueue(false);
        if (roomRef.current) {
          await roomRef.current.disconnect().catch(() => {});
          roomRef.current = null;
        }
      } finally {
        setJoining(false);
        connectingLockRef.current = false;
      }
    },
    [userProfile, syncRemoteParticipant, sendSignal, showToast, unlockLiveVideo]
  );

  // Automated Sunday Drop Queue polling
  const handleEnterQueue = async () => {
    setRoomError(null);
    setEndedNotice(null);
    setInQueue(true);
    triggerHaptic(15);

    try {
      const res = await fetch("/api/queue/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", allowRematch }),
      });
      const data = (await res.json()) as {
        status?: "waiting" | "matched";
        waitingCount?: number;
        roomName?: string;
        partner?: { id: string; displayName: string; areaLabel: string };
        error?: string;
      };
      if (!res.ok) {
        setRoomError(data.error || "Could not enter queue.");
        setInQueue(false);
        return;
      }
      if (data.waitingCount) setWaitingCount(data.waitingCount);
      if (data.status === "matched" && data.roomName && data.partner) {
        await connectToLiveKitRoom(data.roomName, data.partner);
      }
    } catch {
      setRoomError("Network error while joining queue.");
      setInQueue(false);
    }
  };

  const handleLeaveQueue = async () => {
    setInQueue(false);
    await fetch("/api/queue/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave" }),
    }).catch(() => {});
  };

  useEffect(() => {
    if (!inQueue || viewMode !== "greenroom") return;

    const pollQueue = async () => {
      if (connectingLockRef.current) return;
      try {
        const res = await fetch("/api/queue/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "poll", allowRematch }),
        });
        const data = (await res.json()) as {
          status?: "waiting" | "matched";
          waitingCount?: number;
          roomName?: string;
          partner?: { id: string; displayName: string; areaLabel: string };
          error?: string;
        };
        if (!res.ok) {
          setRoomError(data.error || "Queue disconnected.");
          setInQueue(false);
          return;
        }
        if (data.waitingCount) setWaitingCount(data.waitingCount);
        if (data.status === "matched" && data.roomName && data.partner) {
          await connectToLiveKitRoom(data.roomName, data.partner);
        }
      } catch {
        // Retry on next poll
      }
    };

    const interval = setInterval(pollQueue, 2500);
    return () => clearInterval(interval);
  }, [inQueue, viewMode, allowRematch, connectToLiveKitRoom]);

  // Leave call
  const handleLeaveCall = useCallback(
    async (options?: { skipPostCall?: boolean; notice?: string }) => {
      triggerHaptic(30);
      stopPreviewTrack();
      await releaseWakeLock();

      const pId = partnerId || lastPartnerIdRef.current;
      const pName = partnerName || lastPartnerNameRef.current;

      if (roomRef.current) {
        await roomRef.current.disconnect().catch(() => {});
        roomRef.current = null;
      }

      await fetch("/api/queue/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish_call" }),
      }).catch(() => {});

      setConnectionState(ConnectionState.Disconnected);
      setSignalQuality(ConnectionQuality.Unknown);
      setPartnerId(null);
      setPartnerName(null);
      setPartnerArea(null);
      setPartnerMuted(false);
      setPartnerVideoTrack(null);
      setLocalLiveVideoTrack(null);
      setLocalCameraHidden(false);
      setVideoRequestedByMe(false);
      setVideoRequestedByPartner(false);
      setVideoUnlocked(false);
      setShowSafetySheet(false);
      setSoftLightOn(false);
      setPipCorner("top-right");
      setPipDragPos(null);

      if (!options?.skipPostCall && pName) {
        setPostCallPartnerId(pId || pName.toLowerCase());
        setPostCallPartnerName(pName);
        setMyDecision("none");
        setWaitingForMutual(false);
        setViewMode("post-call");
      } else {
        setPostCallPartnerId(null);
        setPostCallPartnerName(null);
        setActiveMatch(null);
        setViewMode("greenroom");
        if (options?.notice) setEndedNotice(options.notice);
      }
    },
    [partnerId, partnerName, releaseWakeLock, stopPreviewTrack]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreviewTrack();
      releaseWakeLock();
      if (roomRef.current) {
        roomRef.current.disconnect().catch(() => {});
      }
    };
  }, [releaseWakeLock, stopPreviewTrack]);

  // Post-call decision
  const handlePostCallDecision = async (decision: "like" | "pass") => {
    if (!postCallPartnerName || !userProfile) return;
    setDecisionBusy(true);
    triggerHaptic(decision === "like" ? [20, 30, 20] : 15);

    try {
      const res = await fetch("/api/calls/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: postCallRoom,
          voterId: userProfile.id,
          voterName: userProfile.display_name,
          targetId: postCallPartnerId || postCallPartnerName,
          targetName: postCallPartnerName,
          decision,
        }),
      });
      const data = (await res.json()) as {
        matched?: boolean;
        match?: MatchRecord;
        waiting?: boolean;
        blocked?: boolean;
      };

      setMyDecision(decision);

      if (decision === "pass" || data.blocked) {
        setViewMode("greenroom");
        setEndedNotice("Call ended. Ready whenever you want to hop back into the Green Room.");
        return;
      }

      if (data.matched && data.match) {
        setActiveMatch(data.match);
        setWaitingForMutual(false);
        setViewMode("chat");
        triggerHaptic([30, 50, 30]);
        return;
      }

      setWaitingForMutual(true);
    } catch {
      showToast("Could not save your choice. Try again.");
    } finally {
      setDecisionBusy(false);
    }
  };

  // Poll for mutual match
  useEffect(() => {
    if (viewMode !== "post-call" || !waitingForMutual || !postCallPartnerId || !userProfile) return;

    const poll = async () => {
      try {
        const qs = new URLSearchParams({
          roomName: postCallRoom,
          voterId: userProfile.id,
          targetId: postCallPartnerId,
        });
        const res = await fetch(`/api/calls/decision?${qs.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          matched?: boolean;
          match?: MatchRecord;
          waiting?: boolean;
        };

        if (data.matched && data.match) {
          setActiveMatch(data.match);
          setWaitingForMutual(false);
          setViewMode("chat");
          triggerHaptic([30, 50, 30]);
        } else if (data.waiting === false) {
          setWaitingForMutual(false);
          setViewMode("greenroom");
          setEndedNotice("Not a mutual match this time. Ready for the next call.");
        }
      } catch {
        // Retry next tick
      }
    };

    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, [viewMode, waitingForMutual, postCallPartnerId, postCallRoom, userProfile]);

  // Poll messages & unlocked Private Vault inside Chat
  const fetchChatMessages = useCallback(async (matchId: string) => {
    try {
      const res = await fetch(`/api/messages?matchId=${encodeURIComponent(matchId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages?: ChatMessage[];
        blocked?: boolean;
        partnerProfile?: PartnerVaultProfile | null;
      };
      if (data.blocked) {
        setActiveMatch(null);
        setViewMode("greenroom");
        setEndedNotice("This conversation is no longer active.");
        return;
      }
      setChatMessages(data.messages || []);
      if (data.partnerProfile) {
        setPartnerVault(data.partnerProfile);
      }
    } catch {
      // Retry next poll
    }
  }, []);

  useEffect(() => {
    if (viewMode !== "chat" || !activeMatch) return;
    setPartnerVault(null);
    fetchChatMessages(activeMatch.id);
    const interval = setInterval(() => {
      fetchChatMessages(activeMatch.id);
    }, 2500);
    return () => clearInterval(interval);
  }, [viewMode, activeMatch, fetchChatMessages]);

  useEffect(() => {
    if (viewMode === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, viewMode]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !activeMatch || !userProfile) return;

    setSendingChat(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: activeMatch.id,
          senderId: userProfile.id,
          senderName: userProfile.display_name,
          text,
        }),
      });
      const data = (await res.json()) as { message?: ChatMessage; error?: string };
      if (!res.ok) {
        showToast(data.error || "Message could not be sent.");
        return;
      }
      if (data.message) {
        setChatMessages((prev) => [...prev, data.message as ChatMessage]);
      }
      setChatInput("");
    } finally {
      setSendingChat(false);
    }
  };

  // Report & Block
  const getReportTarget = (): { id: string | null; name: string | null } => {
    if (viewMode === "call") {
      return {
        id: partnerId || lastPartnerIdRef.current,
        name: partnerName || lastPartnerNameRef.current,
      };
    }
    if (viewMode === "post-call") {
      return { id: postCallPartnerId, name: postCallPartnerName };
    }
    if (viewMode === "chat" && activeMatch && userProfile) {
      const meId = userProfile.id.toLowerCase();
      return activeMatch.user_a === meId
        ? { id: activeMatch.user_b, name: activeMatch.user_b_display }
        : { id: activeMatch.user_a, name: activeMatch.user_a_display };
    }
    return { id: null, name: null };
  };

  const handleReportAndBlock = async (reason: string) => {
    const target = getReportTarget();
    setReportSubmitting(true);
    triggerHaptic([30, 30, 30]);

    let resultNotice =
      "Safety report saved and this person is now permanently blocked from matching with you.";

    try {
      if ((target.id || target.name) && userProfile) {
        const res = await fetch("/api/calls/terminate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomName: activeRoomName || postCallRoom,
            reporter: userProfile.id,
            reported: target.name || target.id,
            reportedId: target.id || undefined,
            reason,
            matchId: activeMatch?.id,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          reportCount?: number;
          autoSuspended?: boolean;
        };
        if (data.autoSuspended) {
          resultNotice = `Report saved. ${target.name || "This account"} was blocked and auto-suspended after ${data.reportCount} reports.`;
        } else if (data.ok) {
          resultNotice = `Report saved and ${target.name || "this person"} is permanently blocked from matching with you.`;
        }
      }
    } finally {
      setReportSubmitting(false);
      setShowSafetySheet(false);
      await handleLeaveCall({ skipPostCall: true, notice: resultNotice });
    }
  };

  // Live call media handlers
  const handleToggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    const nextEnabled = isMuted;
    try {
      await room.localParticipant.setMicrophoneEnabled(nextEnabled);
      setIsMuted(!nextEnabled);
      triggerHaptic(15);
    } catch {
      showToast("Could not toggle microphone.");
    }
  };

  const handleTogglePreviewCam = async () => {
    if (videoUnlocked) return;
    if (previewTrack) {
      stopPreviewTrack();
      return;
    }
    try {
      const track = await createLocalVideoTrack({ facingMode: "user" });
      setPreviewTrack(track);
      triggerHaptic(15);
    } catch {
      showToast("Camera access denied. Check browser permissions.");
    }
  };

  const handleToggleHideLiveVideo = async () => {
    const room = roomRef.current;
    if (!room || !videoUnlocked) return;
    const nextHidden = !localCameraHidden;
    try {
      await room.localParticipant.setCameraEnabled(!nextHidden);
      setLocalCameraHidden(nextHidden);
      if (!nextHidden) {
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.videoTrack) {
          setLocalLiveVideoTrack(camPub.videoTrack as LocalVideoTrack);
        }
      } else {
        setLocalLiveVideoTrack(null);
      }
      triggerHaptic(15);
    } catch {
      showToast("Could not update camera state.");
    }
  };

  const handleVideoConsentAction = async () => {
    triggerHaptic(20);
    if (videoRequestedByPartner) {
      await sendSignal({ type: "video_request" });
      await unlockLiveVideo();
      return;
    }
    if (videoRequestedByMe) {
      setVideoRequestedByMe(false);
      await sendSignal({ type: "video_cancel" });
      return;
    }
    setVideoRequestedByMe(true);
    await sendSignal({ type: "video_request" });
  };

  const handleDeclineVideo = async () => {
    setVideoRequestedByPartner(false);
    await sendSignal({ type: "video_decline" });
  };

  const handleNewWord = async () => {
    const nextIdx = (sparkIndex + 1) % SPARK_WORDS.length;
    setSparkIndex(nextIdx);
    setSparkVisible(true);
    triggerHaptic(10);
    await sendSignal({ type: "spark_index", index: nextIdx });
  };

  const signalBars =
    signalQuality === ConnectionQuality.Excellent
      ? 3
      : signalQuality === ConnectionQuality.Good
      ? 2
      : signalQuality === ConnectionQuality.Poor
      ? 1
      : connectionState === ConnectionState.Connected
      ? 3
      : 0;

  const reportTarget = getReportTarget();
  const safetySheetModal = showSafetySheet && (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#F0E2CC]/20 bg-[#171215] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#EBB8BF]">
            <ShieldIcon className="w-5 h-5" />
            <h3 className="font-serif text-lg font-medium text-[#F8F1E7]">Safety Controls</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowSafetySheet(false)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#A89A90] hover:bg-[#241C20] hover:text-[#F5EDE2]"
            aria-label="Close safety menu"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-1.5 text-xs text-[#A89A90]">
          Reporting immediately disconnects and blocks {reportTarget.name || "this user"} from matching with you again. Repeat reports auto-suspend accounts.
        </p>

        <div className="mt-4 space-y-2">
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              disabled={reportSubmitting}
              onClick={() => handleReportAndBlock(reason)}
              className="w-full min-h-[46px] rounded-xl border border-[#6E3943] bg-[#291519] px-4 text-left text-sm font-medium text-[#F2CFD4] hover:bg-[#3A1E24] transition disabled:opacity-50"
            >
              Report and Block: {reason}
            </button>
          ))}
        </div>

        {viewMode === "call" && (
          <button
            type="button"
            onClick={() => handleLeaveCall({ skipPostCall: true, notice: "You left the call safely." })}
            className="mt-4 w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#221B1E] text-sm font-semibold text-[#F5EDE2] hover:bg-[#2E2529]"
          >
            Just Leave Call
          </button>
        )}
      </div>
    </div>
  );

  // ---------------- 0. AUTH LOADING OR SIGN-IN GATE ----------------
  if (authChecking) {
    return (
      <main className="min-h-[100dvh] bg-[#0E0B0D] text-[#F5EDE2] flex items-center justify-center p-4">
        <p className="text-sm text-[#B3A499]">Loading your Coastal Dusk session...</p>
      </main>
    );
  }

  if (!userProfile) {
    return (
      <main className="min-h-[100dvh] bg-[#0E0B0D] text-[#F5EDE2] flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[#A89A90] hover:text-[#F5EDE2] transition"
          >
            &larr; Back to Overview
          </Link>

          <div className="rounded-3xl border border-[#F0E2CC]/15 bg-[#171215] p-6 shadow-2xl space-y-5">
            <div>
              <span className="inline-flex items-center rounded-full border border-[#E5C17B]/35 bg-[#E5C17B]/10 px-3 py-1 text-xs font-medium tracking-wide text-[#E5C17B]">
                Coastal Dusk Green Room
              </span>
              <h1 className="mt-3 font-serif text-2xl font-semibold text-[#F8F1E7]">
                Sign in to join tonight&apos;s Drop
              </h1>
              <p className="mt-1 text-xs text-[#B3A499]">
                Sign in with the email and password from your Cohort 01 signup so we can pair you using your SWFL preferences.
              </p>
            </div>

            {loginError && (
              <div className="rounded-xl border border-[#8E434F] bg-[#31171C] px-4 py-3 text-xs text-[#F4C4CB]">
                {loginError}
              </div>
            )}

            <form onSubmit={handleInlineLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-4 text-sm text-[#F8F1E7] placeholder:text-[#6D6059] focus:border-[#E5C17B] focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90]">
                    Password
                  </label>
                  <Link href="/reset-password" className="text-xs text-[#E5C17B] hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  className="w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-4 text-sm text-[#F8F1E7] placeholder:text-[#6D6059] focus:border-[#E5C17B] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loginBusy}
                className="w-full min-h-[48px] rounded-xl bg-[#E5C17B] px-5 text-sm font-semibold text-[#1A1310] transition hover:bg-[#EED093] disabled:opacity-60"
              >
                {loginBusy ? "Signing In..." : "Sign In"}
              </button>
            </form>

            <p className="text-center text-xs text-[#A89A90]">
              New to Coastal Dusk?{" "}
              <Link href="/join" className="text-[#E5C17B] underline hover:text-[#F2D7A4]">
                Reserve your SWFL spot
              </Link>
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ---------------- 1. SUNDAY DROP GREEN ROOM ----------------
  if (viewMode === "greenroom") {
    const meIdLower = userProfile.id.toLowerCase();
    return (
      <main className="min-h-[100dvh] bg-[#0E0B0D] text-[#F5EDE2] flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#E5C17B]">
              Signed in as {userProfile.display_name}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-[#A89A90] hover:text-[#F5EDE2] underline"
            >
              Sign out
            </button>
          </div>

          <div className="rounded-3xl border border-[#F0E2CC]/15 bg-[#171215] p-6 shadow-2xl space-y-5">
            <div>
              <span className="inline-flex items-center rounded-full border border-[#E5C17B]/35 bg-[#E5C17B]/10 px-3 py-1 text-xs font-medium tracking-wide text-[#E5C17B]">
                Sunday Drop Green Room
              </span>
              <h1 className="mt-3 font-serif text-2xl font-semibold text-[#F8F1E7]">
                {inQueue ? "Finding your next conversation..." : `Ready, ${userProfile.display_name}?`}
              </h1>
              <p className="mt-1.5 text-xs text-[#B3A499] leading-relaxed">
                {inQueue
                  ? `Looking for a compatible SWFL match within ${userProfile.max_drive_miles} miles (ages ${userProfile.min_age_pref} to ${userProfile.max_age_pref}). Your call starts voice-first automatically.`
                  : "Tap below to enter the live matchmaking queue. We pair you automatically by age range, SWFL drive distance, and safety filters."}
              </p>
            </div>

            {endedNotice && (
              <div className="rounded-xl border border-[#E5C17B]/30 bg-[#251E18] px-4 py-3 text-xs text-[#F0D9AE]">
                {endedNotice}
              </div>
            )}

            {roomError && (
              <div className="rounded-xl border border-[#8E434F] bg-[#31171C] px-4 py-3 text-xs text-[#F4C4CB]">
                {roomError}
              </div>
            )}

            {/* Profile matching summary */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-[#F0E2CC]/12 bg-[#110D10] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#A89A90]">Your Area</p>
                  <p className="mt-0.5 text-[#F5EDE2]">{userProfile.area_label}</p>
                </div>
                <div className="rounded-xl border border-[#F0E2CC]/12 bg-[#110D10] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#A89A90]">Match Range</p>
                  <p className="mt-0.5 text-[#F5EDE2]">
                    Ages {userProfile.min_age_pref}-{userProfile.max_age_pref}, {userProfile.max_drive_miles} mi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditPrefs(true)}
                className="w-full min-h-[42px] rounded-xl border border-[#E5C17B]/35 bg-[#221B17] px-3 text-xs font-semibold text-[#F0D9AE] hover:bg-[#2E251F] transition"
              >
                Edit Preferences &amp; Vault Details
              </button>
            </div>

            {!inQueue ? (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={joining}
                  onClick={handleEnterQueue}
                  className="w-full min-h-[50px] rounded-2xl bg-[#E5C17B] px-5 text-base font-semibold text-[#1A1310] transition hover:bg-[#EED093] disabled:opacity-60"
                >
                  {joining ? "Connecting to Call..." : "Enter Tonight's Queue"}
                </button>

                <label className="flex items-center gap-2.5 rounded-xl border border-[#F0E2CC]/10 bg-[#110D10] px-3.5 py-2.5 text-xs text-[#C9BCB0] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowRematch}
                    onChange={(e) => setAllowRematch(e.target.checked)}
                    className="h-4 w-4 accent-[#E5C17B]"
                  />
                  <span>Beta test mode: allow re-matching recent test partners</span>
                </label>

                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => setShowManualRoom((prev) => !prev)}
                    className="text-[11px] text-[#A89A90] hover:text-[#E5C17B] underline"
                  >
                    {showManualRoom ? "Hide manual room test" : "Join a manual test room code instead"}
                  </button>
                </div>

                {showManualRoom && (
                  <div className="rounded-xl border border-[#F0E2CC]/15 bg-[#110D10] p-3 space-y-2.5">
                    <input
                      type="text"
                      value={manualRoomCode}
                      onChange={(e) => setManualRoomCode(e.target.value)}
                      placeholder="coastal-dusk-test"
                      className="w-full min-h-[42px] rounded-xl border border-[#F0E2CC]/20 bg-[#171215] px-3 text-sm text-[#F8F1E7] focus:border-[#E5C17B] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={joining}
                      onClick={() => connectToLiveKitRoom(manualRoomCode.trim() || "coastal-dusk-test")}
                      className="w-full min-h-[42px] rounded-xl border border-[#E5C17B]/40 bg-[#251E18] text-xs font-semibold text-[#F0D9AE] hover:bg-[#31271F]"
                    >
                      Join Manual Room
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#E5C17B]/35 bg-[#211A16] p-4 text-center space-y-1.5">
                  <div className="mx-auto h-3 w-3 rounded-full bg-[#E5C17B] animate-pulse" />
                  <p className="text-sm font-medium text-[#F8F1E7]">
                    Waiting in Green Room ({formatDuration(queueWaitSeconds)})
                  </p>
                  <p className="text-xs text-[#C9BCB0]">
                    {waitingCount} {waitingCount === 1 ? "person" : "people"} currently in queue
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleLeaveQueue}
                  className="w-full min-h-[46px] rounded-xl border border-[#6E3943] bg-[#291519] text-sm font-semibold text-[#EBB8BF] hover:bg-[#3A1E24] transition"
                >
                  Leave Queue
                </button>
              </div>
            )}
          </div>

          {/* Saved Mutual Matches */}
          {myMatches.length > 0 && (
            <div className="rounded-2xl border border-[#F0E2CC]/15 bg-[#171215] p-5 shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#E5C17B] mb-3">
                Your Mutual Matches ({myMatches.length})
              </p>
              <div className="space-y-2">
                {myMatches.map((m) => {
                  const otherName = m.user_a === meIdLower ? m.user_b_display : m.user_a_display;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setActiveMatch(m);
                        setViewMode("chat");
                      }}
                      className="w-full min-h-[48px] flex items-center justify-between rounded-xl border border-[#F0E2CC]/15 bg-[#1F181C] px-4 hover:bg-[#2A2126] transition"
                    >
                      <span className="font-medium text-[#F8F1E7]">{otherName}</span>
                      <span className="text-xs font-semibold text-[#E5C17B]">Open Chat</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ---------------- 2. POST-CALL DECISION VIEW ----------------
  if (viewMode === "post-call") {
    return (
      <main className="fixed inset-0 bg-[#0E0B0D] text-[#F5EDE2] flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-md rounded-2xl border border-[#F0E2CC]/18 bg-[#171215] p-6 shadow-2xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#E5C17B]/40 bg-[#221B1D] font-serif text-2xl font-semibold text-[#E5C17B]">
            {(postCallPartnerName || "?").charAt(0).toUpperCase()}
          </div>

          <h1 className="mt-4 font-serif text-2xl font-medium text-[#F8F1E7]">
            {waitingForMutual
              ? `You liked ${postCallPartnerName}`
              : `Keep talking with ${postCallPartnerName}?`}
          </h1>

          <p className="mt-2 text-sm text-[#B3A499]">
            {waitingForMutual
              ? `Waiting to see if ${postCallPartnerName} wants to match too. If it is mutual, private messaging and their Vault details will unlock right away.`
              : "If you both say yes, you will unlock private messages and see each other's Private Vault details."}
          </p>

          {!waitingForMutual && myDecision === "none" ? (
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                disabled={decisionBusy}
                onClick={() => handlePostCallDecision("like")}
                className="w-full min-h-[48px] rounded-xl bg-[#E5C17B] text-base font-semibold text-[#1A1310] hover:bg-[#EED093] transition disabled:opacity-60"
              >
                {decisionBusy ? "Saving..." : `Yes, Keep Talking with ${postCallPartnerName}`}
              </button>

              <button
                type="button"
                disabled={decisionBusy}
                onClick={() => handlePostCallDecision("pass")}
                className="w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#1F191C] text-sm font-medium text-[#DDD0C2] hover:bg-[#2B2327] transition"
              >
                Pass for Now
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-[#E5C17B]/30 bg-[#241D17] px-4 py-3 text-xs text-[#F0D9AE]">
                Checking for mutual match...
              </div>
              <button
                type="button"
                onClick={() => {
                  setWaitingForMutual(false);
                  setViewMode("greenroom");
                }}
                className="w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#1F191C] text-sm font-medium text-[#DDD0C2] hover:bg-[#2B2327]"
              >
                Back to Green Room (Saved if they match)
              </button>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-[#F0E2CC]/10">
            <button
              type="button"
              onClick={() => setShowSafetySheet(true)}
              className="min-h-[44px] px-4 rounded-xl text-xs font-semibold text-[#EBB8BF] hover:bg-[#291519] transition inline-flex items-center gap-1.5"
            >
              <ShieldIcon className="w-4 h-4" />
              <span>Report or Block {postCallPartnerName}</span>
            </button>
          </div>
        </div>
        {safetySheetModal}
      </main>
    );
  }

  // ---------------- 3. MUTUAL MATCH & POST-CALL MESSAGES VIEW ----------------
  if (viewMode === "chat" && activeMatch) {
    const meIdLower = userProfile.id.toLowerCase();
    const otherName =
      activeMatch.user_a === meIdLower ? activeMatch.user_b_display : activeMatch.user_a_display;

    return (
      <div className="fixed inset-0 flex flex-col bg-[#0F0C0E] text-[#F5EDE2] overflow-hidden">
        <header className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 bg-[#141013] border-b border-[#F0E2CC]/15">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                setActiveMatch(null);
                setViewMode("greenroom");
              }}
              className="min-h-[44px] px-3 rounded-xl border border-[#F0E2CC]/15 bg-[#1E181C] text-xs font-medium text-[#E6DACB] hover:bg-[#292126]"
            >
              Back
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#E5C17B]">
                Mutual Match
              </p>
              <h2 className="truncate font-serif text-base font-medium text-[#F8F1E7]">
                {otherName}
                {partnerVault?.age ? `, ${partnerVault.age}` : ""}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowMatchProfileCard((prev) => !prev)}
              className="min-h-[44px] px-3 rounded-xl border border-[#E5C17B]/40 bg-[#251E18] text-xs font-medium text-[#F0D9AE] hover:bg-[#31271F]"
            >
              {showMatchProfileCard ? "Hide Vault" : "Match Vault"}
            </button>
            <button
              type="button"
              onClick={() => setShowSafetySheet(true)}
              className="min-h-[44px] px-3 rounded-xl bg-[#2A161A] border border-[#6E3943] text-[#EBB8BF] text-xs font-semibold hover:bg-[#3A1E24] flex items-center gap-1"
            >
              <ShieldIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Safety</span>
            </button>
          </div>
        </header>

        {/* Unlocked Private Vault Profile Card */}
        {showMatchProfileCard && (
          <div className="shrink-0 bg-[#181316] border-b border-[#F0E2CC]/15 px-4 py-3">
            {partnerVault ? (
              <div className="mx-auto max-w-xl grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-[#F0E2CC]/12 bg-[#1F181C] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-[#A89A90]">Area &amp; Height</p>
                  <p className="mt-0.5 text-[#F5EDE2]">
                    {partnerVault.areaLabel} ({partnerVault.height})
                  </p>
                </div>
                <div className="rounded-xl border border-[#F0E2CC]/12 bg-[#1F181C] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-[#A89A90]">Occupation</p>
                  <p className="mt-0.5 text-[#F5EDE2]">{partnerVault.occupation}</p>
                </div>
                <div className="rounded-xl border border-[#F0E2CC]/12 bg-[#1F181C] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-[#A89A90]">Intent &amp; Smoking</p>
                  <p className="mt-0.5 text-[#F5EDE2]">
                    {partnerVault.intent} / {partnerVault.smoking}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E5C17B]/25 bg-[#241D17] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-[#E5C17B]">Favorite First-Meet Spot</p>
                  <p className="mt-0.5 text-[#F8F1E7]">{partnerVault.firstMeetSpot}</p>
                </div>
                {partnerVault.kids && (
                  <div className="col-span-2 rounded-xl border border-[#F0E2CC]/12 bg-[#1F181C] p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-[#A89A90]">Kids</p>
                    <p className="mt-0.5 text-[#F5EDE2]">{partnerVault.kids}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mx-auto max-w-xl text-xs text-[#A89A90]">
                Southwest Florida mutual match
              </div>
            )}
          </div>
        )}

        <section className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="mx-auto max-w-xl space-y-3">
            {chatMessages.length === 0 ? (
              <div className="rounded-2xl border border-[#F0E2CC]/12 bg-[#171215] p-5 text-center">
                <p className="font-serif text-lg text-[#F8F1E7]">
                  You and {otherName} matched.
                </p>
                <p className="mt-1 text-xs text-[#A89A90]">
                  Send a message below to keep the conversation going or suggest meeting at their favorite local spot.
                </p>
              </div>
            ) : (
              chatMessages.map((msg) => {
                const isMine = msg.sender_identity === meIdLower;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        isMine
                          ? "bg-[#E5C17B] text-[#1A1310] font-medium"
                          : "bg-[#1E181C] border border-[#F0E2CC]/15 text-[#F5EDE2]"
                      }`}
                    >
                      {msg.body}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>
        </section>

        <footer className="shrink-0 bg-[#141013] border-t border-[#F0E2CC]/15 px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <form onSubmit={handleSendMessage} className="mx-auto max-w-xl flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={`Message ${otherName}...`}
              className="flex-1 min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-4 text-sm text-[#F8F1E7] placeholder:text-[#6D6059] focus:border-[#E5C17B] focus:outline-none"
            />
            <button
              type="submit"
              disabled={sendingChat || !chatInput.trim()}
              className="min-h-[46px] px-5 rounded-xl bg-[#E5C17B] text-sm font-semibold text-[#1A1310] hover:bg-[#EED093] disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </footer>

        {safetySheetModal}
      </div>
    );
  }

  // ---------------- 4. LIVE CALL VIEW ----------------
  const partnerLabel = partnerName || "Waiting for match";
  const hasTopBanner =
    connectionState === ConnectionState.Reconnecting ||
    isMuted ||
    (Boolean(partnerName) && partnerMuted) ||
    (isLightingDark && !softLightOn) ||
    Boolean(toast);

  const pipPositionClass =
    pipCorner === "top-right"
      ? `${hasTopBanner ? "top-16" : "top-3"} right-3`
      : pipCorner === "top-left"
      ? `${hasTopBanner ? "top-16" : "top-3"} left-3`
      : pipCorner === "bottom-right"
      ? `${sparkVisible ? "bottom-36" : "bottom-16"} right-3`
      : `${sparkVisible ? "bottom-36" : "bottom-16"} left-3`;

  return (
    <div
      className={`fixed inset-0 overflow-hidden flex flex-col bg-[#0F0C0E] text-[#F5EDE2] select-none transition-all duration-300 ${
        softLightOn
          ? "border-[12px] border-[#F8EBD3] shadow-[inset_0_0_40px_rgba(248,235,211,0.45)]"
          : "border-0"
      }`}
    >
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <header className="shrink-0 z-30 flex items-center justify-between gap-2 px-3 py-2.5 bg-[#141013]/95 border-b border-[#F0E2CC]/12">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex items-end gap-0.5 h-4 px-1"
            aria-label={`Connection quality ${signalBars} of 3`}
          >
            {[1, 2, 3].map((bar) => (
              <span
                key={bar}
                className={`w-1 rounded-full transition-colors ${
                  bar === 1 ? "h-1.5" : bar === 2 ? "h-2.5" : "h-3.5"
                } ${
                  bar <= signalBars
                    ? signalBars === 1
                      ? "bg-[#C87D6A]"
                      : "bg-[#E5C17B]"
                    : "bg-[#382F32]"
                }`}
              />
            ))}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-[#F8F1E7]">
                {partnerLabel}
              </span>
              <span className="shrink-0 rounded-full border border-[#F0E2CC]/15 bg-[#1F191C] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[#C9BCB0]">
                {formatDuration(elapsedSeconds)}
              </span>
            </div>
            <p className="text-[11px] text-[#A89A90] truncate">
              {videoUnlocked
                ? "Live video shared"
                : partnerArea
                ? `${partnerArea} (Voice-first)`
                : "Voice-first mode"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSoftLightOn((prev) => !prev);
              triggerHaptic(15);
            }}
            className={`min-h-[44px] px-3 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 ${
              softLightOn
                ? "bg-[#F8EBD3] text-[#1A1310] border-[#F8EBD3]"
                : "bg-[#1C1619] text-[#E6DACB] border-[#F0E2CC]/20 hover:bg-[#261E22]"
            }`}
            aria-pressed={softLightOn}
            title="Toggle warm screen glow for dark rooms"
          >
            <SunIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Soft Light</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowSafetySheet(true);
              triggerHaptic(15);
            }}
            className="min-h-[44px] px-3 rounded-xl bg-[#2A161A] border border-[#6E3943] text-[#EBB8BF] text-xs font-semibold hover:bg-[#3A1E24] transition flex items-center gap-1.5"
          >
            <ShieldIcon className="w-4 h-4" />
            <span>Safety</span>
          </button>
        </div>
      </header>

      <section
        ref={stageRef}
        className="relative flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center bg-gradient-to-b from-[#171215] via-[#110D10] to-[#0B080A]"
      >
        {videoUnlocked && partnerVideoTrack ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center px-6">
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-[#E5C17B]/35 bg-[#221B1D] font-serif text-3xl font-semibold text-[#E5C17B] shadow-lg">
              {(partnerName || "?").charAt(0).toUpperCase()}
              {partnerName && !partnerMuted && (
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#E5C17B] text-[#1A1310] ring-2 ring-[#110D10]">
                  <MicOnIcon className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
            <h2 className="mt-4 font-serif text-xl font-medium text-[#F8F1E7]">
              {partnerName ? `Talking with ${partnerName}` : "Connecting..."}
            </h2>
            <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-[#A89A90]">
              {partnerName
                ? videoUnlocked
                  ? `${partnerName} has their camera hidden right now.`
                  : "Voice is live. Video unlocks only when both of you tap Request Video."
                : "Waiting for your match to join the voice room."}
            </p>
          </div>
        )}

        {/* TOP STATUS BANNERS */}
        <div className="pointer-events-none absolute top-3 inset-x-3 z-20 flex flex-col items-center gap-2">
          {connectionState === ConnectionState.Reconnecting && (
            <div className="rounded-full border border-[#E5C17B]/45 bg-[#2A2118]/95 backdrop-blur-md px-4 py-1.5 text-xs font-medium text-[#F3DBAC] shadow">
              Reconnecting... hold tight, call is still active
            </div>
          )}

          {isMuted && (
            <div className="flex items-center gap-1.5 rounded-full border border-[#B85766] bg-[#7A2835]/95 px-4 py-1.5 text-xs font-semibold text-[#FFF1F3] shadow-lg">
              <MicOffIcon className="w-3.5 h-3.5" />
              <span>You are muted. Tap Unmute to speak.</span>
            </div>
          )}

          {partnerName && partnerMuted && (
            <div className="flex items-center gap-1.5 rounded-full border border-[#F0E2CC]/20 bg-[#1B1518]/92 px-3.5 py-1 text-xs font-medium text-[#E4D8CA] shadow">
              <MicOffIcon className="w-3.5 h-3.5 text-[#E5C17B]" />
              <span>{partnerName} is muted</span>
            </div>
          )}

          {isLightingDark && !softLightOn && (
            <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-[#E5C17B]/35 bg-[#1A1417]/95 backdrop-blur px-3.5 py-2 text-xs text-[#F2E4CE] shadow-lg">
              <span>Your video looks dark. Face a lamp or try Soft Light.</span>
              <button
                type="button"
                onClick={() => setSoftLightOn(true)}
                className="shrink-0 rounded-lg bg-[#E5C17B] px-2.5 py-1 text-xs font-semibold text-[#1A1310]"
              >
                Turn On
              </button>
            </div>
          )}

          {toast && (
            <div className="rounded-full border border-[#F0E2CC]/20 bg-[#1B1518]/95 px-4 py-1.5 text-xs font-medium text-[#F5EDE2] shadow-lg">
              {toast}
            </div>
          )}
        </div>

        {/* INCOMING VIDEO CONSENT PROMPT */}
        {videoRequestedByPartner && !videoUnlocked && (
          <div
            className={`absolute inset-x-3 z-20 flex justify-center ${
              sparkVisible ? "bottom-36" : "bottom-16"
            }`}
          >
            <div className="w-full max-w-sm rounded-2xl border border-[#E5C17B]/40 bg-[#181316]/95 backdrop-blur-md p-3.5 shadow-2xl">
              <p className="text-sm font-medium text-[#F8F1E7]">
                {partnerName || "Your match"} wants to turn on live video.
              </p>
              <p className="text-xs text-[#A89A90] mt-0.5">
                Both cameras turn on together only if you say yes.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleVideoConsentAction}
                  className="flex-1 min-h-[44px] rounded-xl bg-[#E5C17B] text-xs font-semibold text-[#1A1310] hover:bg-[#EED093]"
                >
                  Turn On Video
                </button>
                <button
                  type="button"
                  onClick={handleDeclineVideo}
                  className="min-h-[44px] px-4 rounded-xl border border-[#F0E2CC]/20 bg-[#211B1E] text-xs font-medium text-[#DDD0C2] hover:bg-[#2C2428]"
                >
                  Stay Audio-Only
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DRAGGABLE SELF-VIEW TILE */}
        {activeLocalVideoTrack && !localCameraHidden && (
          <div
            ref={pipRef}
            onPointerDown={handlePipPointerDown}
            onPointerMove={handlePipPointerMove}
            onPointerUp={handlePipPointerUp}
            onPointerCancel={handlePipPointerUp}
            style={
              pipDragPos
                ? { left: `${pipDragPos.left}px`, top: `${pipDragPos.top}px` }
                : undefined
            }
            className={`absolute z-20 w-28 sm:w-36 aspect-[3/4] overflow-hidden rounded-2xl border border-[#F0E2CC]/30 bg-black shadow-2xl touch-none cursor-grab active:cursor-grabbing ${
              pipDragPos
                ? "scale-[1.03] shadow-[0_16px_40px_rgba(0,0,0,0.7)]"
                : `transition-all duration-300 ease-out ${pipPositionClass}`
            }`}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="pointer-events-none h-full w-full object-cover scale-x-[-1]"
            />
            <div className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#F5EDE2]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E5C17B]" />
              <span>{videoUnlocked ? "LIVE" : "Only you"}</span>
            </div>
            {isMuted && (
              <div className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#7A2835] text-[#FFF1F3] shadow">
                <MicOffIcon className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        )}

        {/* ORIGINAL 3-SECOND SPARK CARD */}
        <div className="absolute bottom-2.5 inset-x-3 z-20 flex justify-center">
          {sparkVisible ? (
            <div className="w-full max-w-lg rounded-2xl border border-[#F0E2CC]/20 bg-[#141013]/92 backdrop-blur-md px-4 py-3 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#E5C17B]">
                  3-Second Spark
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleNewWord}
                    className="min-h-[40px] px-3.5 rounded-full border border-[#F0E2CC]/25 bg-[#1F191C] hover:bg-[#2B2327] text-xs font-medium text-[#F5EDE2] transition"
                  >
                    New Word
                  </button>
                  <button
                    type="button"
                    onClick={() => setSparkVisible(false)}
                    className="min-h-[40px] px-3 rounded-xl text-xs font-medium text-[#A89A90] hover:text-[#F5EDE2] hover:bg-[#1F191C] transition"
                  >
                    Hide
                  </button>
                </div>
              </div>

              <div className="mt-1 font-serif text-2xl sm:text-3xl font-medium text-[#F8F1E7] tracking-tight break-words">
                {SPARK_WORDS[sparkIndex]}
              </div>

              <p className="mt-1 text-[11px] text-[#B8AAA0] leading-snug">
                Just a random thing. Say whatever pops into your head in the first 3 seconds.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSparkVisible(true)}
              className="min-h-[44px] px-4 rounded-full border border-[#F0E2CC]/20 bg-[#141013]/90 backdrop-blur text-xs font-medium text-[#E5C17B] hover:bg-[#1F191C] shadow-lg flex items-center gap-1.5"
            >
              <SparkIcon className="w-3.5 h-3.5" />
              <span>3-Second Spark</span>
            </button>
          )}
        </div>
      </section>

      <footer className="shrink-0 z-30 bg-[#141013] border-t border-[#F0E2CC]/15 px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleToggleMute}
              className={`min-h-[48px] rounded-xl px-3 text-xs sm:text-sm font-semibold border transition flex items-center justify-center gap-1.5 ${
                isMuted
                  ? "bg-[#7A2835] border-[#B85766] text-[#FFF1F3] hover:bg-[#8E303F]"
                  : "bg-[#1E181C] border-[#F0E2CC]/20 text-[#F5EDE2] hover:bg-[#292126]"
              }`}
            >
              {isMuted ? (
                <>
                  <MicOffIcon className="w-4 h-4 shrink-0" />
                  <span>Unmute</span>
                </>
              ) : (
                <>
                  <MicOnIcon className="w-4 h-4 shrink-0" />
                  <span>Mute</span>
                </>
              )}
            </button>

            {!videoUnlocked ? (
              <button
                type="button"
                onClick={handleTogglePreviewCam}
                className={`min-h-[48px] rounded-xl px-3 text-xs sm:text-sm font-semibold border transition flex items-center justify-center gap-1.5 ${
                  previewTrack
                    ? "bg-[#2C231A] border-[#A68653] text-[#F2D7A4]"
                    : "bg-[#1E181C] border-[#F0E2CC]/20 text-[#F5EDE2] hover:bg-[#292126]"
                }`}
              >
                <CameraIcon className="w-4 h-4 shrink-0" />
                <span>{previewTrack ? "Close Preview" : "Preview Cam"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleToggleHideLiveVideo}
                className={`min-h-[48px] rounded-xl px-3 text-xs sm:text-sm font-semibold border transition flex items-center justify-center gap-1.5 ${
                  localCameraHidden
                    ? "bg-[#2C231A] border-[#A68653] text-[#F2D7A4]"
                    : "bg-[#1E181C] border-[#F0E2CC]/20 text-[#F5EDE2] hover:bg-[#292126]"
                }`}
              >
                <CameraIcon className="w-4 h-4 shrink-0" />
                <span>{localCameraHidden ? "Show Video" : "Hide Video"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleLeaveCall()}
              className="min-h-[48px] rounded-xl bg-[#291519] border border-[#6E3943] px-3 text-xs sm:text-sm font-semibold text-[#EBB8BF] hover:bg-[#3A1E24] transition flex items-center justify-center gap-1.5"
            >
              <LeaveIcon className="w-4 h-4 shrink-0" />
              <span>Leave</span>
            </button>
          </div>

          {!videoUnlocked && (
            <button
              type="button"
              onClick={handleVideoConsentAction}
              className={`w-full min-h-[46px] rounded-xl px-3 text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
                videoRequestedByMe
                  ? "bg-[#2C231A] border border-[#E5C17B]/60 text-[#F2D7A4]"
                  : "bg-[#E5C17B] text-[#1A1310] hover:bg-[#EED093]"
              }`}
            >
              {videoRequestedByMe ? (
                <span>Waiting for {partnerName || "match"}... (Cancel)</span>
              ) : (
                <span>Request Video</span>
              )}
            </button>
          )}
        </div>
      </footer>

      {safetySheetModal}
    </div>
  );
}

// ---------------- INLINE SVG ICONS ----------------

function MicOnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 10l5-3v10l-5-3z" />
      <rect x="2" y="6" width="13" height="12" rx="2" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z" />
    </svg>
  );
}

function LeaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}