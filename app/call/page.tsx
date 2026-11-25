"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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

type ViewMode = "lobby" | "call" | "post-call" | "chat";
type PipCorner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

type SignalMessage =
  | { type: "video_request" }
  | { type: "video_cancel" }
  | { type: "video_decline" }
  | { type: "spark_index"; index: number };

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
  // Navigation & identity
  const [viewMode, setViewMode] = useState<ViewMode>("lobby");
  const [displayName, setDisplayName] = useState("");
  const [roomName, setRoomName] = useState("coastal-dusk-test");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [endedNotice, setEndedNotice] = useState<string | null>(null);

  // Active call state
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [signalQuality, setSignalQuality] = useState<ConnectionQuality>(
    ConnectionQuality.Unknown
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Local & partner media
  const [isMuted, setIsMuted] = useState(false);
  const [partnerName, setPartnerName] = useState<string | null>(null);
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
  const [postCallPartner, setPostCallPartner] = useState<string | null>(null);
  const [postCallRoom, setPostCallRoom] = useState<string>("coastal-dusk-test");
  const [myDecision, setMyDecision] = useState<"none" | "like" | "pass">("none");
  const [waitingForMutual, setWaitingForMutual] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);

  // Matches & Chat state
  const [myMatches, setMyMatches] = useState<MatchRecord[]>([]);
  const [activeMatch, setActiveMatch] = useState<MatchRecord | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [showMatchProfileCard, setShowMatchProfileCard] = useState(false);

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
  const lastPartnerRef = useRef<string | null>(null);

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

  // Load saved matches when name is typed in lobby
  const loadMyMatches = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setMyMatches([]);
      return;
    }
    try {
      const res = await fetch(`/api/messages?identity=${encodeURIComponent(trimmed)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { matches?: MatchRecord[] };
      setMyMatches(data.matches || []);
    } catch {
      // Ignore network hiccups
    }
  }, []);

  useEffect(() => {
    if (viewMode !== "lobby") return;
    const t = setTimeout(() => {
      loadMyMatches(displayName);
    }, 350);
    return () => clearTimeout(t);
  }, [displayName, viewMode, loadMyMatches]);

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

  // Quiet call timer
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

  // Attach remote video
  useEffect(() => {
    const videoEl = remoteVideoRef.current;
    if (!videoEl || !partnerVideoTrack) return;
    partnerVideoTrack.attach(videoEl);
    return () => {
      partnerVideoTrack.detach(videoEl);
    };
  }, [partnerVideoTrack, videoUnlocked]);

  // Attach local video
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
    const remoteName = participant.name || participant.identity || "Your Match";
    setPartnerName(remoteName);
    lastPartnerRef.current = remoteName;
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

  const fetchLiveKitToken = async (room: string, name: string) => {
    const body = JSON.stringify({
      room,
      roomName: room,
      name,
      participantName: name,
      identity: name,
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
        identity: name,
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

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = displayName.trim();
    const trimmedRoom = roomName.trim() || "coastal-dusk-test";
    if (!trimmedName) {
      setJoinError("Enter your first name to join the room.");
      return;
    }

    setJoining(true);
    setJoinError(null);
    setEndedNotice(null);

    try {
      // Check if this user is suspended from prior safety reports
      const safetyRes = await fetch("/api/safety/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: trimmedName }),
      });
      const safetyData = (await safetyRes.json().catch(() => ({}))) as {
        allowed?: boolean;
        reason?: string;
      };
      if (safetyData.allowed === false) {
        setJoinError(safetyData.reason || "Unable to join due to safety restrictions.");
        setJoining(false);
        return;
      }

      const { token, serverUrl } = await fetchLiveKitToken(trimmedRoom, trimmedName);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;
      lastPartnerRef.current = null;

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        setConnectionState(state);
      });

      room.on(
        RoomEvent.ConnectionQualityChanged,
        (quality: ConnectionQuality, participant: Participant) => {
          if (participant.isLocal) {
            setSignalQuality(quality);
          }
        }
      );

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        syncRemoteParticipant(participant);
        showToast(`${participant.name || participant.identity} joined the call`);
        if (videoReqMeRef.current) sendSignal({ type: "video_request" });
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        const who = participant.name || participant.identity || "Your match";
        lastPartnerRef.current = who;
        setPartnerName(null);
        setPartnerMuted(false);
        setPartnerVideoTrack(null);
        setVideoRequestedByPartner(false);
        showToast(`${who} left the call. Tap Leave to decide if you want to match.`);
      });

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          const remoteName = participant.name || participant.identity || "Your Match";
          setPartnerName(remoteName);
          lastPartnerRef.current = remoteName;
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
          const who = participant?.name || participant?.identity || "Your match";

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

      setPostCallRoom(trimmedRoom);
      setSparkVisible(true);
      setViewMode("call");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to connect to call room.";
      setJoinError(msg);
      if (roomRef.current) {
        await roomRef.current.disconnect().catch(() => {});
        roomRef.current = null;
      }
    } finally {
      setJoining(false);
    }
  };

  // Leave call: route to Post-Call Decision if we talked with someone, otherwise Lobby
  const handleLeaveCall = useCallback(
    async (options?: { skipPostCall?: boolean; notice?: string }) => {
      triggerHaptic(30);
      stopPreviewTrack();
      await releaseWakeLock();

      const partnerWeSpokeWith = partnerName || lastPartnerRef.current;

      if (roomRef.current) {
        await roomRef.current.disconnect().catch(() => {});
        roomRef.current = null;
      }

      setConnectionState(ConnectionState.Disconnected);
      setSignalQuality(ConnectionQuality.Unknown);
      setPartnerName(null);
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

      if (!options?.skipPostCall && partnerWeSpokeWith) {
        setPostCallPartner(partnerWeSpokeWith);
        setMyDecision("none");
        setWaitingForMutual(false);
        setViewMode("post-call");
      } else {
        setPostCallPartner(null);
        setActiveMatch(null);
        setViewMode("lobby");
        if (options?.notice) setEndedNotice(options.notice);
      }
    },
    [partnerName, releaseWakeLock, stopPreviewTrack]
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

  // Post-call decision submit (Like or Pass)
  const handlePostCallDecision = async (decision: "like" | "pass") => {
    if (!postCallPartner || !displayName.trim()) return;
    setDecisionBusy(true);
    triggerHaptic(decision === "like" ? [20, 30, 20] : 15);

    try {
      const res = await fetch("/api/calls/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: postCallRoom,
          voterName: displayName.trim(),
          targetName: postCallPartner,
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
        setViewMode("lobby");
        setEndedNotice("Call ended. Ready whenever you want to hop into the next one.");
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

  // Poll for mutual match while waiting on Post-Call screen
  useEffect(() => {
    if (viewMode !== "post-call" || !waitingForMutual || !postCallPartner) return;

    const poll = async () => {
      try {
        const qs = new URLSearchParams({
          roomName: postCallRoom,
          voterName: displayName.trim(),
          targetName: postCallPartner,
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
          setViewMode("lobby");
          setEndedNotice("Not a mutual match this time. Ready for the next call.");
        }
      } catch {
        // Retry on next tick
      }
    };

    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, [viewMode, waitingForMutual, postCallPartner, postCallRoom, displayName]);

  // Poll messages when inside Post-Call Chat view
  const fetchChatMessages = useCallback(async (matchId: string) => {
    try {
      const res = await fetch(`/api/messages?matchId=${encodeURIComponent(matchId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages?: ChatMessage[];
        blocked?: boolean;
      };
      if (data.blocked) {
        setActiveMatch(null);
        setViewMode("lobby");
        setEndedNotice("This conversation is no longer active.");
        return;
      }
      setChatMessages(data.messages || []);
    } catch {
      // Retry on next poll
    }
  }, []);

  useEffect(() => {
    if (viewMode !== "chat" || !activeMatch) return;
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
    if (!text || !activeMatch || !displayName.trim()) return;

    setSendingChat(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: activeMatch.id,
          senderName: displayName.trim(),
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

  // Report & Block (works in Call, Post-Call, and Chat)
  const getReportTarget = () => {
    if (viewMode === "call") return partnerName || lastPartnerRef.current;
    if (viewMode === "post-call") return postCallPartner;
    if (viewMode === "chat" && activeMatch) {
      const me = displayName.trim().toLowerCase();
      return activeMatch.user_a === me ? activeMatch.user_b_display : activeMatch.user_a_display;
    }
    return null;
  };

  const handleReportAndBlock = async (reason: string) => {
    const target = getReportTarget();
    setReportSubmitting(true);
    triggerHaptic([30, 30, 30]);

    let resultNotice =
      "Safety report saved and this person is now permanently blocked from matching with you.";

    try {
      if (target && displayName.trim()) {
        const res = await fetch("/api/calls/terminate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomName: viewMode === "call" ? roomName : postCallRoom,
            reporter: displayName.trim(),
            reported: target,
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
          resultNotice = `Report saved and ${target} was blocked and auto-suspended after ${data.reportCount} reports.`;
        } else if (data.ok) {
          resultNotice = `Report saved and ${target} is permanently blocked from matching with you.`;
        }
      }
    } finally {
      setReportSubmitting(false);
      setShowSafetySheet(false);
      await handleLeaveCall({ skipPostCall: true, notice: resultNotice });
    }
  };

  // Call control handlers
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

  // Shared Safety Sheet Modal
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
          Reporting immediately disconnects and blocks {getReportTarget() || "this user"} from matching with you again. Repeat reports auto-suspend accounts.
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

  // ---------------- 1. LOBBY VIEW ----------------
  if (viewMode === "lobby") {
    const meLower = displayName.trim().toLowerCase();
    return (
      <main className="min-h-[100dvh] bg-[#0E0B0D] text-[#F5EDE2] flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="rounded-2xl border border-[#F0E2CC]/15 bg-[#171215] p-6 shadow-2xl">
            <div className="mb-5">
              <span className="inline-flex items-center rounded-full border border-[#E5C17B]/35 bg-[#E5C17B]/10 px-3 py-1 text-xs font-medium tracking-wide text-[#E5C17B]">
                Coastal Dusk Live Room
              </span>
              <h1 className="mt-3 font-serif text-2xl font-semibold tracking-tight text-[#F8F1E7]">
                Voice-First Test Call
              </h1>
              <p className="mt-1.5 text-sm text-[#B3A499]">
                Start with voice. Video unlocks mutually, and after you hang up you can choose whether to match and text.
              </p>
            </div>

            {endedNotice && (
              <div className="mb-4 rounded-xl border border-[#E5C17B]/30 bg-[#251E18] px-4 py-3 text-sm text-[#F0D9AE]">
                {endedNotice}
              </div>
            )}

            {joinError && (
              <div className="mb-4 rounded-xl border border-[#8E434F] bg-[#31171C] px-4 py-3 text-sm text-[#F4C4CB]">
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[#A89A90] mb-1.5">
                  Your First Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g., Justin"
                  autoComplete="given-name"
                  className="w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-4 text-base text-[#F8F1E7] placeholder:text-[#6D6059] focus:border-[#E5C17B] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[#A89A90] mb-1.5">
                  Room Code
                </label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="coastal-dusk-test"
                  className="w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-4 text-base text-[#F8F1E7] placeholder:text-[#6D6059] focus:border-[#E5C17B] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={joining}
                className="w-full min-h-[48px] rounded-xl bg-[#E5C17B] px-5 text-base font-semibold text-[#1A1310] transition hover:bg-[#EED093] disabled:opacity-60"
              >
                {joining ? "Connecting Audio..." : "Join Voice Room"}
              </button>
            </form>
          </div>

          {/* Saved Mutual Matches */}
          {myMatches.length > 0 && (
            <div className="rounded-2xl border border-[#F0E2CC]/15 bg-[#171215] p-5 shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#E5C17B] mb-3">
                Your Mutual Matches ({myMatches.length})
              </p>
              <div className="space-y-2">
                {myMatches.map((m) => {
                  const otherName = m.user_a === meLower ? m.user_b_display : m.user_a_display;
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
            {(postCallPartner || "?").charAt(0).toUpperCase()}
          </div>

          <h1 className="mt-4 font-serif text-2xl font-medium text-[#F8F1E7]">
            {waitingForMutual
              ? `You liked ${postCallPartner}`
              : `Keep talking with ${postCallPartner}?`}
          </h1>

          <p className="mt-2 text-sm text-[#B3A499]">
            {waitingForMutual
              ? `Waiting to see if ${postCallPartner} wants to match too. If it's mutual, private messaging will open right away.`
              : "If you both say yes, you will unlock private messages and can decide what to share before meeting."}
          </p>

          {!waitingForMutual && myDecision === "none" ? (
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                disabled={decisionBusy}
                onClick={() => handlePostCallDecision("like")}
                className="w-full min-h-[48px] rounded-xl bg-[#E5C17B] text-base font-semibold text-[#1A1310] hover:bg-[#EED093] transition disabled:opacity-60"
              >
                {decisionBusy ? "Saving..." : `Yes, Keep Talking with ${postCallPartner}`}
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
                  setViewMode("lobby");
                }}
                className="w-full min-h-[46px] rounded-xl border border-[#F0E2CC]/20 bg-[#1F191C] text-sm font-medium text-[#DDD0C2] hover:bg-[#2B2327]"
              >
                Back to Lobby (We will save it if they match)
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
              <span>Report or Block {postCallPartner}</span>
            </button>
          </div>
        </div>
        {safetySheetModal}
      </main>
    );
  }

  // ---------------- 3. MUTUAL MATCH & POST-CALL MESSAGES VIEW ----------------
  if (viewMode === "chat" && activeMatch) {
    const meLower = displayName.trim().toLowerCase();
    const otherName =
      activeMatch.user_a === meLower ? activeMatch.user_b_display : activeMatch.user_a_display;

    return (
      <div className="fixed inset-0 flex flex-col bg-[#0F0C0E] text-[#F5EDE2] overflow-hidden">
        {/* Chat Header */}
        <header className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 bg-[#141013] border-b border-[#F0E2CC]/15">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                setActiveMatch(null);
                setViewMode("lobby");
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
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowMatchProfileCard((prev) => !prev)}
              className="min-h-[44px] px-3 rounded-xl border border-[#E5C17B]/40 bg-[#251E18] text-xs font-medium text-[#F0D9AE] hover:bg-[#31271F]"
            >
              {showMatchProfileCard ? "Hide Info" : "Match Info"}
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

        {/* Expandable Post-Call Match Info Card */}
        {showMatchProfileCard && (
          <div className="shrink-0 bg-[#181316] border-b border-[#F0E2CC]/15 px-4 py-3">
            <div className="mx-auto max-w-xl grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-[#F0E2CC]/12 bg-[#1F181C] p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-[#A89A90]">Region</p>
                <p className="mt-0.5 text-[#F5EDE2]">Southwest Florida</p>
              </div>
              <div className="rounded-xl border border-[#F0E2CC]/12 bg-[#1F181C] p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-[#A89A90]">Status</p>
                <p className="mt-0.5 text-[#E5C17B]">Matched after live call</p>
              </div>
            </div>
          </div>
        )}

        {/* Messages Thread */}
        <section className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="mx-auto max-w-xl space-y-3">
            {chatMessages.length === 0 ? (
              <div className="rounded-2xl border border-[#F0E2CC]/12 bg-[#171215] p-5 text-center">
                <p className="font-serif text-lg text-[#F8F1E7]">
                  You and {otherName} matched.
                </p>
                <p className="mt-1 text-xs text-[#A89A90]">
                  Send a message below to keep the conversation going or plan a local coffee.
                </p>
              </div>
            ) : (
              chatMessages.map((msg) => {
                const isMine = msg.sender_identity === meLower;
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

        {/* Message Composer */}
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

  // ---------------- 4. LIVE CALL VIEW (FIXED INSET-0 LOCKED FOR ANDROID CHROME) ----------------
  const partnerLabel = partnerName || "Waiting for partner";
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
      ? `${sparkVisible ? "bottom-32" : "bottom-16"} right-3`
      : `${sparkVisible ? "bottom-32" : "bottom-16"} left-3`;

  return (
    <div
      className={`fixed inset-0 overflow-hidden flex flex-col bg-[#0F0C0E] text-[#F5EDE2] select-none transition-all duration-300 ${
        softLightOn
          ? "border-[12px] border-[#F8EBD3] shadow-[inset_0_0_40px_rgba(248,235,211,0.45)]"
          : "border-0"
      }`}
    >
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* PINNED TOP HEADER */}
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
              {videoUnlocked ? "Live video shared" : "Voice-first mode"}
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

      {/* MAIN CALL STAGE */}
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
              {partnerName ? `Talking with ${partnerName}` : "Waiting in the room..."}
            </h2>
            <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-[#A89A90]">
              {partnerName
                ? videoUnlocked
                  ? `${partnerName} has their camera hidden right now.`
                  : "Voice is live. Video unlocks only when both of you tap Request Video."
                : `Share room code "${roomName}" on your second device to connect.`}
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
              sparkVisible ? "bottom-32" : "bottom-16"
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
            <div className="w-full max-w-lg rounded-2xl border border-[#F0E2CC]/20 bg-[#141013]/88 backdrop-blur-md px-3.5 py-2.5 shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#A89A90] leading-tight shrink-0">
                  3-Second
                  <br />
                  Spark
                </span>

                <span className="font-serif text-xl sm:text-2xl font-medium text-[#F8F1E7] tracking-tight truncate px-1">
                  {SPARK_WORDS[sparkIndex]}
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleNewWord}
                    className="min-h-[44px] px-3.5 rounded-full border border-[#F0E2CC]/25 bg-[#1F191C] hover:bg-[#2B2327] text-xs font-medium text-[#F5EDE2] transition"
                  >
                    New Word
                  </button>
                  <button
                    type="button"
                    onClick={() => setSparkVisible(false)}
                    className="min-h-[44px] px-3 rounded-xl text-xs font-medium text-[#A89A90] hover:text-[#F5EDE2] hover:bg-[#1F191C] transition"
                  >
                    Hide
                  </button>
                </div>
              </div>

              <p className="mt-1.5 text-[11px] text-[#B8AAA0] leading-snug">
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

      {/* PINNED BOTTOM CONTROL DOCK */}
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