'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  LiveKitRoom,
  VideoTrack,
  RoomAudioRenderer,
  useTracks,
  useDataChannel,
  useConnectionState,
  useLocalParticipant,
} from '@livekit/components-react';
import { Track, ConnectionState } from 'livekit-client';

const SPARK_WORDS = [
  'Gecko',
  'Fire Hydrant',
  'Umbrella',
  'Manatee',
  'Pelican',
  'Hammock',
  'Iguana',
  'Toaster',
  'Flamingo',
  'Compass',
  'Armadillo',
  'Lantern',
  'Sea Turtle',
  'Thermos',
  'Chameleon',
  'Canoe',
  'Starfish',
  'Porch Swing',
  'Mailbox',
  'Paperclip',
  'Lighthouse',
  'Tree Frog',
  'Flip-Flops',
];

const SPARK_HINTS = [
  'Just a random thing. Say whatever pops into your head in the first 3 seconds.',
  'No wrong answers. Share your unfiltered 3-second thought to break the ice.',
  'Skip the small talk. Toss out the very first memory or take this brings up.',
  'Not a quiz. Just say the first thing that crosses your mind and see where it goes.',
];

function CallStage({
  identity,
  onLeave,
  connectionError,
}: {
  identity: string;
  onLeave: (reason: 'normal' | 'safety') => void;
  connectionError: string | null;
}) {
  const [myRevealStage, setMyRevealStage] = useState(0);
  const [partnerRevealStage, setPartnerRevealStage] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [concealPartnerVideo, setConcealPartnerVideo] = useState(false);
  const [showPrivatePreview, setShowPrivatePreview] = useState(false);
  const [showVerifyInfo, setShowVerifyInfo] = useState(false);
  const [showSafetyMenu, setShowSafetyMenu] = useState(false);
  const [sparkOpen, setSparkOpen] = useState(true);
  const [wordIndex, setWordIndex] = useState(() => Math.floor(Math.random() * SPARK_WORDS.length));
  const [hintIndex, setHintIndex] = useState(0);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  const connState = useConnectionState();
  const { localParticipant } = useLocalParticipant();

  // Mutual stage only advances when BOTH users agree
  const activeRevealStage = Math.min(myRevealStage, partnerRevealStage);

  const { send } = useDataChannel('reveal-sync', (msg) => {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(msg.payload));
      if (parsed.type === 'reveal' && parsed.from !== identity) {
        setPartnerRevealStage((prev) => Math.max(prev, parsed.stage));
      }
      if (parsed.type === 'terminate') {
        onLeave('safety');
      }
    } catch {
      // Ignore malformed messages
    }
  });

  // Keep local camera strictly local during Stage 0 private preview
  useEffect(() => {
    let active = true;
    const stopPreview = () => {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
    };

    if (showPrivatePreview && activeRevealStage === 0) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((stream) => {
          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          previewStreamRef.current = stream;
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
          }
        })
        .catch(() => {
          setShowPrivatePreview(false);
        });
    } else {
      stopPreview();
    }

    return () => {
      active = false;
      stopPreview();
    };
  }, [showPrivatePreview, activeRevealStage]);

  // Publish LiveKit camera ONLY after mutual Stage 1 reveal
  useEffect(() => {
    if (activeRevealStage >= 1 && localParticipant) {
      setShowPrivatePreview(false);
      localParticipant.setCameraEnabled(true).catch(() => {});
    }
  }, [activeRevealStage, localParticipant]);

  const handleToggleMute = useCallback(async () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (localParticipant) {
      await localParticipant.setMicrophoneEnabled(!nextMuted).catch(() => {});
    }
  }, [isMuted, localParticipant]);

  const handleRevealTap = useCallback(() => {
    const nextStage = Math.min(2, myRevealStage + 1);
    setMyRevealStage(nextStage);
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: 'reveal', from: identity, stage: nextStage })
    );
    send(payload, { reliable: true });
  }, [myRevealStage, identity, send]);

  const handleSafetyExit = useCallback(() => {
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: 'terminate', from: identity })
    );
    send(payload, { reliable: true });
    onLeave('safety');
  }, [identity, send, onLeave]);

  const shuffleWord = () => {
    setWordIndex((prev) => {
      let next = Math.floor(Math.random() * SPARK_WORDS.length);
      if (next === prev) next = (prev + 1) % SPARK_WORDS.length;
      return next;
    });
    setHintIndex((prev) => (prev + 1) % SPARK_HINTS.length);
  };

  const tracks = useTracks([Track.Source.Camera, Track.Source.Microphone], { onlySubscribed: false });
  const remoteCamTrack = tracks.find(
    (t) => !t.participant.isLocal && t.source === Track.Source.Camera
  );
  const remoteAnyTrack = tracks.find((t) => !t.participant.isLocal);
  const localCamTrack = tracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.Camera
  );

  const hasPartner = Boolean(remoteAnyTrack);
  const partnerName = remoteAnyTrack ? remoteAnyTrack.participant.identity : 'Finding someone';
  const partnerInitial = remoteAnyTrack ? partnerName.charAt(0).toUpperCase() : 'S';

  const statusLabel =
    connState !== ConnectionState.Connected
      ? 'Connecting audio...'
      : hasPartner
      ? activeRevealStage >= 1
        ? 'Live video shared'
        : 'Connected · Voice only'
      : 'Finding your conversation partner...';

  return (
    <div className="relative h-screen w-full max-w-md mx-auto bg-[#161412] text-[#F5F0EB] overflow-hidden flex flex-col justify-between sm:border-x sm:border-[#F5F0EB]/12">
      <RoomAudioRenderer />

      {/* Full-Bleed Background Stage */}
      <div className="absolute inset-0 z-0">
        {remoteCamTrack && activeRevealStage >= 1 && !concealPartnerVideo ? (
          <VideoTrack
            trackRef={remoteCamTrack}
            className="w-full h-full object-cover transition-opacity duration-700"
          />
        ) : (
          <div className="relative w-full h-full bg-gradient-to-b from-[#211D1A] via-[#161412] to-[#12100E] flex flex-col items-center justify-center px-6 text-center">
            <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-[#D96B52]/10 blur-[90px]" />

            {concealPartnerVideo && activeRevealStage >= 1 ? (
              <div className="relative z-10 space-y-2 max-w-xs">
                <p className="font-serif text-xl text-[#F5F0EB]">Partner video hidden</p>
                <p className="text-xs text-[#C2B9B0] leading-relaxed">
                  Audio is still active. Tap Show Video below whenever you want to bring it back.
                </p>
              </div>
            ) : (
              <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-xs -mt-8 space-y-5">
                {/* Warm Voice Halo */}
                <div className="relative flex items-center justify-center w-36 h-36">
                  <div className="absolute inset-0 rounded-full bg-[#D96B52]/15 blur-2xl animate-dusk-halo" />
                  <div className="absolute inset-2 rounded-full border border-[#E5C185]/20 animate-dusk-halo" />
                  <div className="absolute inset-6 rounded-full border border-[#E5C185]/35 bg-[#E5C185]/10 animate-dusk-pulse" />
                  <div className="relative z-10 flex flex-col items-center justify-center w-20 h-20 rounded-full bg-[#231F1C] border border-[#E5C185]/50 shadow-2xl">
                    <span className="font-serif text-2xl text-[#E5C185]">{partnerInitial}</span>
                  </div>
                </div>

                {/* Human Introduction & Essential Compatibility Card */}
                {hasPartner ? (
                  <div className="w-full rounded-2xl border border-[#F5F0EB]/12 bg-[#231F1C]/85 backdrop-blur-md p-4 text-left space-y-2.5 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h2 className="font-serif text-xl text-[#F5F0EB]">
                        Meet {partnerName}, 36
                      </h2>
                      <span className="rounded-full bg-[#7A9E7E]/20 px-2.5 py-0.5 text-[10px] font-medium text-[#9AC19E] border border-[#7A9E7E]/30">
                        Voice On
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-[#E3DBD3]">
                      <p>Sarasota area &bull; Lives here year-round</p>
                      <p>Seeking a long-term relationship</p>
                      <p className="text-[#C2B9B0]">No kids &bull; Open to kids &bull; Non-smoker</p>
                    </div>

                    <p className="pt-1 border-t border-[#F5F0EB]/10 text-[11px] text-[#C2B9B0] leading-relaxed">
                      Your camera stays private until you both agree. Start with hello.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E5C185]">
                      {statusLabel}
                    </p>
                    <h2 className="font-serif text-2xl text-[#F5F0EB]">
                      Your next introduction starts here.
                    </h2>
                    <p className="text-xs text-[#C2B9B0] leading-relaxed">
                      You will start with voice. Your camera and full profile stay private until you both choose to reveal them.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Scrims for legibility */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#161412]/90 via-[#161412]/40 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[#161412] via-[#161412]/80 to-transparent" />
      </div>

      {/* Floating Top Bar */}
      <div className="relative z-20 p-4 space-y-2">
        {connectionError && (
          <div className="rounded-2xl border border-[#C85A5A]/50 bg-[#C85A5A]/20 backdrop-blur-md px-4 py-2.5 text-xs text-[#F5F0EB]">
            Connection error: {connectionError}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#F5F0EB]/12 bg-[#231F1C]/85 backdrop-blur-xl px-3.5 py-2.5 shadow-lg">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-sm text-[#F5F0EB]">
                {hasPartner ? `${partnerName}, 36` : 'Sunday Live Drop'}
              </span>
              {hasPartner && (
                <button
                  onClick={() => setShowVerifyInfo((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-full bg-[#7A9E7E]/20 hover:bg-[#7A9E7E]/30 border border-[#7A9E7E]/35 px-2 py-0.5 text-[10px] font-medium text-[#9AC19E] transition"
                >
                  <span>Checks</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="h-2.5 w-2.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              )}
            </div>
            <p className="truncate text-[11px] text-[#C2B9B0]">
              {statusLabel}
            </p>
          </div>

          {/* Unmistakable Safety Button */}
          <button
            onClick={() => setShowSafetyMenu((v) => !v)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#C85A5A]/15 hover:bg-[#C85A5A]/30 border border-[#C85A5A]/40 px-3 py-1.5 text-xs font-medium text-[#E58A8A] transition"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-3.5 w-3.5"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Safety</span>
          </button>
        </div>

        {/* Tappable Honest Verification Drawer */}
        {showVerifyInfo && (
          <div className="rounded-2xl border border-[#7A9E7E]/35 bg-[#231F1C]/95 backdrop-blur-xl p-4 text-xs space-y-2 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#9AC19E]">What was checked</span>
              <button
                onClick={() => setShowVerifyInfo(false)}
                className="text-[#C2B9B0] hover:text-[#F5F0EB]"
              >
                Close
              </button>
            </div>
            <ul className="space-y-1 text-[#E3DBD3]">
              <li>&bull; Phone verified</li>
              <li>&bull; Selfie matched to profile photos</li>
              <li>&bull; Age checked</li>
            </ul>
            <p className="text-[11px] text-[#C2B9B0] leading-relaxed border-t border-[#F5F0EB]/10 pt-2">
              These checks do not guarantee someone&apos;s background or intentions. Take your time, keep early chats in the app, and never send money.
            </p>
          </div>
        )}

        {/* Unmistakable Safety Menu */}
        {showSafetyMenu && (
          <div className="rounded-2xl border border-[#C85A5A]/40 bg-[#231F1C]/95 backdrop-blur-xl p-4 text-xs space-y-2.5 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#F5F0EB]">Safety Controls</span>
              <button
                onClick={() => setShowSafetyMenu(false)}
                className="text-[#C2B9B0] hover:text-[#F5F0EB]"
              >
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-[#C2B9B0]">
              Leaving is immediate and never requires the other person&apos;s approval.
            </p>
            <button
              onClick={handleSafetyExit}
              className="w-full rounded-xl bg-[#C85A5A] hover:bg-[#b54c4c] py-2.5 text-xs font-semibold text-[#F5F0EB] transition"
            >
              Report &amp; Block Immediately
            </button>
            <button
              onClick={() => onLeave('normal')}
              className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] hover:bg-[#1e1b18] py-2.5 text-xs font-medium text-[#F5F0EB] transition"
            >
              Leave Without Reporting
            </button>
          </div>
        )}
      </div>

      {/* Private Local Camera Preview (Stage 0) OR Live Shared Self-View (Stage 1+) */}
      {activeRevealStage === 0 && showPrivatePreview && (
        <div className="absolute right-4 top-24 z-10 w-28 rounded-2xl overflow-hidden border border-[#E5C185]/45 bg-[#161412] shadow-2xl">
          <div className="bg-[#231F1C] px-2 py-1 text-center text-[9px] font-semibold uppercase tracking-wider text-[#E5C185]">
            Only you see this
          </div>
          <video
            ref={previewVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-32 object-cover"
          />
        </div>
      )}

      {activeRevealStage >= 1 && localCamTrack && (
        <div className="absolute right-4 top-24 z-10 w-24 rounded-2xl overflow-hidden border border-[#7A9E7E]/50 bg-[#161412] shadow-2xl">
          <div className="bg-[#231F1C] px-2 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-[#9AC19E]">
            Live
          </div>
          <VideoTrack trackRef={localCamTrack} className="w-full h-28 object-cover" />
        </div>
      )}

      {/* Bottom Floating Stack */}
      <div className="relative z-10 p-4 space-y-2.5">
        {/* Stage 2 Unlocked Profile Vault */}
        {activeRevealStage >= 2 && (
          <div className="rounded-2xl border border-[#E5C185]/40 bg-[#231F1C]/92 backdrop-blur-xl p-3.5 space-y-1 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E5C185]">
                Full Profile Unlocked
              </span>
              <span className="text-[10px] text-[#9AC19E]">Mutual</span>
            </div>
            <p className="text-sm font-medium text-[#F5F0EB]">
              Marine Biologist &bull; 5&apos;7&quot; &bull; Enjoys early harbor runs
            </p>
            <p className="text-xs text-[#C2B9B0]">
              Always down for sunrise coffee by the water or a quiet weekend on the boat.
            </p>
          </div>
        )}

        {/* 3-Second Spark Word Card (Signature Feature) */}
        {sparkOpen ? (
          <div className="rounded-2xl border border-[#F5F0EB]/14 bg-[#231F1C]/88 backdrop-blur-xl p-3 shadow-lg space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C2B9B0]">
                  3-Second Spark
                </span>
                <span className="font-serif text-lg font-medium text-[#E5C185]">
                  {SPARK_WORDS[wordIndex]}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={shuffleWord}
                  className="rounded-full border border-[#F5F0EB]/15 bg-[#161412]/80 hover:bg-[#161412] px-2.5 py-1 text-[11px] font-medium text-[#F5F0EB] transition"
                >
                  New Word
                </button>
                <button
                  onClick={() => setSparkOpen(false)}
                  className="rounded-full px-2 py-1 text-[11px] text-[#C2B9B0] hover:text-[#F5F0EB] transition"
                >
                  Hide
                </button>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-[#C2B9B0]">
              {SPARK_HINTS[hintIndex]}
            </p>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={() => setSparkOpen(true)}
              className="rounded-full border border-[#F5F0EB]/12 bg-[#231F1C]/85 backdrop-blur-md px-3.5 py-1.5 text-[11px] text-[#C2B9B0] hover:text-[#E5C185] transition"
            >
              Show 3-Second Spark Word
            </button>
          </div>
        )}

        {/* Unmistakable Labeled Control Dock */}
        <div className="grid grid-cols-4 gap-1.5 rounded-2xl border border-[#F5F0EB]/14 bg-[#231F1C]/92 backdrop-blur-xl p-2 shadow-2xl">
          {/* Mute / Unmute */}
          <button
            onClick={handleToggleMute}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-1 transition ${
              isMuted
                ? 'bg-[#E5C185]/15 text-[#E5C185] border border-[#E5C185]/35'
                : 'bg-[#161412]/75 text-[#F5F0EB] hover:bg-[#161412]'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              className="h-4 w-4"
            >
              {isMuted ? (
                <>
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                </>
              ) : (
                <>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                </>
              )}
            </svg>
            <span className="text-[10px] font-medium">{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          {/* Private Preview (Stage 0) OR Hide Partner Video (Stage 1+) */}
          <button
            onClick={() =>
              activeRevealStage === 0
                ? setShowPrivatePreview((v) => !v)
                : setConcealPartnerVideo((v) => !v)
            }
            className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-1 transition ${
              (activeRevealStage === 0 && showPrivatePreview) ||
              (activeRevealStage >= 1 && concealPartnerVideo)
                ? 'bg-[#E5C185]/15 text-[#E5C185] border border-[#E5C185]/35'
                : 'bg-[#161412]/75 text-[#F5F0EB] hover:bg-[#161412]'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              className="h-4 w-4"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="text-[10px] font-medium">
              {activeRevealStage === 0
                ? showPrivatePreview
                  ? 'Hide Self'
                  : 'Preview Cam'
                : concealPartnerVideo
                ? 'Show Video'
                : 'Hide Video'}
            </span>
          </button>

          {/* Mutual Request Video / Reveal Profile */}
          <button
            onClick={handleRevealTap}
            disabled={myRevealStage >= 2}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-1 font-semibold transition ${
              myRevealStage >= 2 && activeRevealStage >= 2
                ? 'bg-[#E5C185]/15 text-[#E5C185] border border-[#E5C185]/35 cursor-default'
                : myRevealStage > activeRevealStage
                ? 'bg-[#E5C185]/20 text-[#E5C185] border border-[#E5C185]/45'
                : 'bg-[#E5C185] hover:bg-[#d9b272] text-[#161412]'
            }`}
          >
            <span className="flex items-center gap-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  activeRevealStage >= 1 ? 'bg-current' : myRevealStage >= 1 ? 'bg-current opacity-60' : 'bg-current opacity-30'
                }`}
              />
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  activeRevealStage >= 2 ? 'bg-current' : myRevealStage >= 2 ? 'bg-current opacity-60' : 'bg-current opacity-30'
                }`}
              />
            </span>
            <span className="text-[10px] leading-tight text-center">
              {myRevealStage >= 2 && activeRevealStage >= 2
                ? 'Revealed'
                : myRevealStage > activeRevealStage
                ? 'Choice Saved'
                : activeRevealStage === 0
                ? 'Request Video'
                : 'Reveal Profile'}
            </span>
          </button>

          {/* Unmistakable Leave Button */}
          <button
            onClick={() => onLeave('normal')}
            className="flex flex-col items-center justify-center gap-1 rounded-xl bg-[#C85A5A]/15 hover:bg-[#C85A5A]/30 border border-[#C85A5A]/35 py-2 px-1 text-[#E58A8A] transition"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="text-[10px] font-medium">Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CallPage() {
  const [name, setName] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [identity, setIdentity] = useState('');
  const [endedReason, setEndedReason] = useState<'normal' | 'safety' | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const joinTestRoom = async () => {
    setLoading(true);
    setErrorMsg(null);
    setConnectionError(null);
    try {
      const res = await fetch('/api/calls/test-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: name.trim() || undefined, roomName: 'swfl-test-room' }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        setErrorMsg(data.error || 'Could not generate LiveKit token. Check .env.local.');
        return;
      }
      setToken(data.token);
      setIdentity(data.identity);
      setEndedReason(null);
      setDecision(null);
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  if (endedReason) {
    return (
      <main className="min-h-screen bg-[#161412] text-[#F5F0EB] flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-3xl border border-[#F5F0EB]/12 bg-[#231F1C] p-7 space-y-6 text-center shadow-2xl">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E5C185]">
              {endedReason === 'safety' ? 'Safety Action Taken' : 'Conversation Complete'}
            </p>
            <h2 className="font-serif text-2xl text-[#F5F0EB]">
              {endedReason === 'safety' ? 'Room closed and user blocked.' : 'Thanks for showing up.'}
            </h2>
            <p className="text-xs text-[#C2B9B0] leading-relaxed">
              We will only connect you again in the app if the interest is mutual.
            </p>
          </div>

          {!decision ? (
            <div className="space-y-2.5">
              <button
                onClick={() => setDecision('Connect again (if mutual)')}
                className="w-full rounded-2xl bg-[#D96B52] hover:bg-[#c85e46] py-3.5 text-sm font-semibold text-[#F5F0EB] transition"
              >
                I&apos;d Like to Connect Again
              </button>
              <button
                onClick={() => setDecision('Not a match')}
                className="w-full rounded-2xl border border-[#F5F0EB]/12 bg-[#161412] hover:bg-[#1c1917] py-3.5 text-sm text-[#F5F0EB] transition"
              >
                Not a Match
              </button>
              <button
                onClick={() => setDecision('Reported concern')}
                className="w-full rounded-2xl border border-[#C85A5A]/30 bg-[#C85A5A]/10 hover:bg-[#C85A5A]/20 py-3 text-xs font-medium text-[#E58A8A] transition"
              >
                Report a Concern
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#E5C185]/30 bg-[#161412] px-4 py-3 text-sm text-[#E5C185]">
                Recorded privately: {decision}
              </div>
              <button
                onClick={() => {
                  setToken(null);
                  setEndedReason(null);
                }}
                className="w-full rounded-2xl bg-[#161412] hover:bg-[#1c1917] border border-[#F5F0EB]/12 py-3.5 text-sm font-medium text-[#F5F0EB] transition"
              >
                Return to Green Room
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="relative min-h-screen bg-[#161412] text-[#F5F0EB] flex items-center justify-center p-6 overflow-hidden">
        <div className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full bg-[#D96B52]/12 blur-[110px]" />
        </div>

        <div className="relative z-10 w-full max-w-sm space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[#C2B9B0] hover:text-[#F5F0EB] transition"
          >
            &larr; Back to Overview
          </Link>

          <div className="rounded-3xl border border-[#F5F0EB]/12 bg-[#231F1C]/92 backdrop-blur-xl p-7 space-y-5 shadow-2xl">
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E5C185]">
                Green Room Check-In
              </span>
              <h1 className="font-serif text-3xl text-[#F5F0EB]">Start with a voice.</h1>
              <p className="text-xs text-[#C2B9B0] leading-relaxed">
                Your camera starts completely off. Video only turns on if you both tap Request Video during the conversation.
              </p>
            </div>

            {errorMsg && (
              <div className="rounded-2xl border border-[#C85A5A]/45 bg-[#C85A5A]/15 p-3 text-xs text-[#F5F0EB]">
                {errorMsg}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0]">
                First Name
              </label>
              <input
                type="text"
                placeholder="e.g. Jordan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && joinTestRoom()}
                className="w-full rounded-2xl border border-[#F5F0EB]/15 bg-[#161412] px-4 py-3.5 text-sm text-[#F5F0EB] placeholder-[#C2B9B0]/45 focus:outline-none focus:border-[#E5C185] transition"
              />
            </div>

            <button
              onClick={joinTestRoom}
              disabled={loading}
              className="w-full rounded-2xl bg-[#D96B52] hover:bg-[#c85e46] py-3.5 text-sm font-semibold text-[#F5F0EB] shadow-lg shadow-[#D96B52]/15 disabled:opacity-50 transition"
            >
              {loading ? 'Connecting Audio...' : 'Join Voice Introduction'}
            </button>

            <div className="flex items-center justify-between border-t border-[#F5F0EB]/10 pt-3.5 text-[11px] text-[#C2B9B0]">
              <span>Camera off by default</span>
              <span>Leave anytime</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <LiveKitRoom
      connect={true}
      video={false}
      audio={true}
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      onError={(err) => setConnectionError(err.message)}
    >
      <CallStage
        identity={identity}
        connectionError={connectionError}
        onLeave={(reason) => {
          setToken(null);
          setEndedReason(reason);
        }}
      />
    </LiveKitRoom>
  );
}
