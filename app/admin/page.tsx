"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type AdminStats = {
  activeMen: number;
  waitlistedMen: number;
  activeWomen: number;
  waitlistedWomen: number;
  pendingPhotos: number;
  pendingReports: number;
  suspendedCount: number;
  liveQueueCount: number;
};

type AdminProfile = {
  id: string;
  created_at: string;
  gender: "man" | "woman";
  cohort_status: string;
  display_name: string;
  age: number | null;
  area_label: string;
  occupation: string | null;
  photo_verification_status: string | null;
  location_verified: boolean | null;
  location_verified_at: string | null;
  location_ip_flag: string | null;
  photoSignedUrls: string[];
  selfieSignedUrl: string | null;
};

type AdminReport = {
  id: string;
  room_name: string | null;
  reporter_identity: string;
  reported_identity: string;
  reporterDisplay: string;
  reportedDisplay: string;
  reason: string;
  status: string;
  created_at: string;
};

type AdminSuspended = {
  identity: string;
  displayName: string;
  report_count: number;
  reason: string | null;
  suspended_at: string;
};

type AdminBlock = {
  id: string;
  blocker_identity: string;
  blocked_identity: string;
  blockerDisplay: string;
  blockedDisplay: string;
  reason: string | null;
  created_at: string;
};

type OverviewData = {
  adminEmail: string;
  stats: AdminStats;
  profiles: AdminProfile[];
  reports: AdminReport[];
  suspended: AdminSuspended[];
  blocks: AdminBlock[];
};

type AdminTab = "photos" | "safety" | "members";

function formatShortDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("photos");
  const [photoFilter, setPhotoFilter] = useState<"pending" | "all">("pending");
  const [memberFilter, setMemberFilter] = useState<"all" | "active" | "waitlisted" | "banned">("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      const payload = (await res.json().catch(() => ({}))) as OverviewData & { error?: string };
      if (!res.ok) {
        setAuthError(payload.error || "Admin access denied.");
        setData(null);
        return;
      }
      setData(payload);
    } catch {
      setAuthError("Could not reach the admin endpoint.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const runAction = async (key: string, body: Record<string, unknown>) => {
    setBusyKey(key);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setNotice(payload.error || "Action failed.");
        return;
      }
      if (payload.message) setNotice(payload.message);
      await loadOverview();
    } finally {
      setBusyKey(null);
    }
  };

  if (loading && !data) {
    return (
      <main className="min-h-[100dvh] bg-[#0E0B0D] text-[#F5EDE2] flex items-center justify-center p-4">
        <p className="text-sm text-[#B3A499]">Loading Coastal Dusk Admin...</p>
      </main>
    );
  }

  if (authError || !data) {
    return (
      <main className="min-h-[100dvh] bg-[#0E0B0D] text-[#F5EDE2] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-[#8E434F] bg-[#171215] p-7 text-center space-y-4 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#EBB8BF]">
            Restricted Area
          </p>
          <h1 className="font-serif text-2xl text-[#F8F1E7]">Admin Access Required</h1>
          <p className="text-xs text-[#B3A499] leading-relaxed">
            {authError || "Sign in with your Coastal Dusk admin account to open moderation controls."}
          </p>
          <div className="flex gap-2.5 pt-2">
            <Link
              href="/login"
              className="flex-1 min-h-[46px] flex items-center justify-center rounded-xl bg-[#E5C17B] text-sm font-semibold text-[#1A1310] hover:bg-[#EED093]"
            >
              Go to Sign In
            </Link>
            <Link
              href="/call"
              className="flex-1 min-h-[46px] flex items-center justify-center rounded-xl border border-[#F0E2CC]/20 bg-[#1F191C] text-sm font-medium text-[#DDD0C2] hover:bg-[#2B2327]"
            >
              Green Room
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const photoReviewList = data.profiles.filter((p) => {
    if (photoFilter === "pending") return p.photo_verification_status === "pending";
    return Boolean(p.selfieSignedUrl) || p.photoSignedUrls.length > 0;
  });

  const filteredMembers = data.profiles.filter((p) => {
    if (memberFilter === "all") return true;
    return p.cohort_status === memberFilter;
  });

  return (
    <main className="min-h-[100dvh] bg-[#0E0B0D] text-[#F5EDE2] p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E5C17B]">
              Coastal Dusk Moderation
            </p>
            <h1 className="font-serif text-2xl sm:text-3xl font-medium text-[#F8F1E7]">
              Cohort 01 Admin
            </h1>
            <p className="text-xs text-[#A89A90]">Signed in as {data.adminEmail}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadOverview}
              disabled={loading}
              className="min-h-[42px] px-4 rounded-xl border border-[#E5C17B]/40 bg-[#251E18] text-xs font-semibold text-[#F0D9AE] hover:bg-[#31271F] disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <Link
              href="/call"
              className="min-h-[42px] px-4 flex items-center rounded-xl border border-[#F0E2CC]/20 bg-[#171215] text-xs font-medium text-[#E6DACB] hover:bg-[#241C20]"
            >
              Green Room
            </Link>
          </div>
        </header>

        {notice && (
          <div className="rounded-xl border border-[#E5C17B]/35 bg-[#251E18] px-4 py-3 text-xs text-[#F0D9AE]">
            {notice}
          </div>
        )}

        <section className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="rounded-2xl border border-[#F0E2CC]/15 bg-[#171215] p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-[#A89A90]">Active Men</p>
            <p className="mt-1 font-serif text-2xl text-[#F8F1E7]">
              {data.stats.activeMen}
              <span className="text-sm text-[#A89A90]"> / 50</span>
            </p>
            <p className="text-[11px] text-[#A89A90]">Waitlist: {data.stats.waitlistedMen}</p>
          </div>

          <div className="rounded-2xl border border-[#F0E2CC]/15 bg-[#171215] p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-[#A89A90]">Active Women</p>
            <p className="mt-1 font-serif text-2xl text-[#F8F1E7]">
              {data.stats.activeWomen}
              <span className="text-sm text-[#A89A90]"> / 50</span>
            </p>
            <p className="text-[11px] text-[#A89A90]">Waitlist: {data.stats.waitlistedWomen}</p>
          </div>

          <div className="rounded-2xl border border-[#E5C17B]/30 bg-[#1E1813] p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-[#E5C17B]">Pending Photos</p>
            <p className="mt-1 font-serif text-2xl text-[#F8F1E7]">{data.stats.pendingPhotos}</p>
            <p className="text-[11px] text-[#C9BCB0]">Selfies to review</p>
          </div>

          <div className="rounded-2xl border border-[#6E3943] bg-[#221316] p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-[#EBB8BF]">Open Reports</p>
            <p className="mt-1 font-serif text-2xl text-[#F8F1E7]">{data.stats.pendingReports}</p>
            <p className="text-[11px] text-[#D7A8AF]">Suspended: {data.stats.suspendedCount}</p>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-2xl border border-[#7A9E7E]/35 bg-[#141B16] p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-[#9AC19E]">Live Queue</p>
            <p className="mt-1 font-serif text-2xl text-[#F8F1E7]">{data.stats.liveQueueCount}</p>
            <p className="text-[11px] text-[#A7CCA9]">Waiting right now</p>
          </div>
        </section>

        <nav className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("photos")}
            className={`min-h-[44px] rounded-xl text-xs font-semibold border transition ${
              activeTab === "photos"
                ? "bg-[#E5C17B] border-[#E5C17B] text-[#1A1310]"
                : "bg-[#171215] border-[#F0E2CC]/15 text-[#C9BCB0] hover:bg-[#221B1E]"
            }`}
          >
            Photo Reviews ({data.stats.pendingPhotos})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("safety")}
            className={`min-h-[44px] rounded-xl text-xs font-semibold border transition ${
              activeTab === "safety"
                ? "bg-[#E5C17B] border-[#E5C17B] text-[#1A1310]"
                : "bg-[#171215] border-[#F0E2CC]/15 text-[#C9BCB0] hover:bg-[#221B1E]"
            }`}
          >
            Safety &amp; Blocks ({data.stats.pendingReports})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("members")}
            className={`min-h-[44px] rounded-xl text-xs font-semibold border transition ${
              activeTab === "members"
                ? "bg-[#E5C17B] border-[#E5C17B] text-[#1A1310]"
                : "bg-[#171215] border-[#F0E2CC]/15 text-[#C9BCB0] hover:bg-[#221B1E]"
            }`}
          >
            Members ({data.profiles.length})
          </button>
        </nav>

        {activeTab === "photos" && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[#A89A90]">
                Compare each live selfie against Vault photos before approving the Photo Verified badge.
              </p>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setPhotoFilter("pending")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    photoFilter === "pending"
                      ? "border-[#E5C17B] bg-[#251E18] text-[#F0D9AE]"
                      : "border-[#F0E2CC]/15 bg-[#171215] text-[#A89A90]"
                  }`}
                >
                  Pending Only
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    photoFilter === "all"
                      ? "border-[#E5C17B] bg-[#251E18] text-[#F0D9AE]"
                      : "border-[#F0E2CC]/15 bg-[#171215] text-[#A89A90]"
                  }`}
                >
                  All With Media
                </button>
              </div>
            </div>

            {photoReviewList.length === 0 ? (
              <div className="rounded-2xl border border-[#F0E2CC]/12 bg-[#171215] p-8 text-center text-sm text-[#A89A90]">
                {photoFilter === "pending"
                  ? "No pending photo reviews right now."
                  : "No members have uploaded photos or selfies yet."}
              </div>
            ) : (
              <div className="space-y-4">
                {photoReviewList.map((member) => {
                  const status = member.photo_verification_status || "unverified";
                  const ipWarn =
                    member.location_ip_flag &&
                    member.location_ip_flag !== "ok_fl" &&
                    member.location_ip_flag !== "local_dev";

                  return (
                    <div
                      key={member.id}
                      className="rounded-2xl border border-[#F0E2CC]/15 bg-[#171215] p-5 space-y-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-serif text-xl text-[#F8F1E7]">
                              {member.display_name}
                              {member.age ? `, ${member.age}` : ""}
                            </h2>
                            <span className="rounded-full bg-[#241C20] px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-[#C9BCB0]">
                              {member.gender}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                status === "verified"
                                  ? "bg-[#7A9E7E]/20 text-[#9AC19E]"
                                  : status === "rejected"
                                  ? "bg-[#7A2835]/35 text-[#F4C4CB]"
                                  : "bg-[#E5C17B]/20 text-[#E5C17B]"
                              }`}
                            >
                              {status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#A89A90]">
                            {member.area_label}
                            {member.occupation ? ` | ${member.occupation}` : ""}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                            <span
                              className={`rounded-md px-2 py-0.5 ${
                                member.location_verified
                                  ? "bg-[#18241A] text-[#9AC19E]"
                                  : "bg-[#2A2018] text-[#E5C17B]"
                              }`}
                            >
                              {member.location_verified
                                ? `SWFL GPS Verified (${formatShortDate(member.location_verified_at)})`
                                : "SWFL GPS Not Verified"}
                            </span>
                            {member.location_ip_flag && (
                              <span
                                className={`rounded-md px-2 py-0.5 ${
                                  ipWarn
                                    ? "bg-[#31171C] text-[#F4C4CB]"
                                    : "bg-[#1F181C] text-[#A89A90]"
                                }`}
                              >
                                IP Flag: {member.location_ip_flag}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#E5C17B]">
                            Live Selfie
                          </p>
                          {member.selfieSignedUrl ? (
                            <button
                              type="button"
                              onClick={() => setLightboxUrl(member.selfieSignedUrl)}
                              className="block w-full aspect-[3/4] overflow-hidden rounded-xl border-2 border-[#E5C17B]/50 bg-black"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={member.selfieSignedUrl}
                                alt={`${member.display_name} live selfie`}
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <div className="flex aspect-[3/4] items-center justify-center rounded-xl border border-[#F0E2CC]/10 bg-[#100C0E] text-xs text-[#6D6059]">
                              No selfie
                            </div>
                          )}
                        </div>

                        <div className="sm:col-span-3 space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A89A90]">
                            Vault Photos ({member.photoSignedUrls.length}/3)
                          </p>
                          {member.photoSignedUrls.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2">
                              {member.photoSignedUrls.map((url, idx) => (
                                <button
                                  key={url}
                                  type="button"
                                  onClick={() => setLightboxUrl(url)}
                                  className="block aspect-[3/4] overflow-hidden rounded-xl border border-[#F0E2CC]/20 bg-black"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={url}
                                    alt={`${member.display_name} vault photo ${idx + 1}`}
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="flex h-32 items-center justify-center rounded-xl border border-[#F0E2CC]/10 bg-[#100C0E] text-xs text-[#6D6059]">
                              No Vault photos uploaded
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busyKey === `approve-${member.id}`}
                          onClick={() =>
                            runAction(`approve-${member.id}`, {
                              action: "approve_photo",
                              userId: member.id,
                            })
                          }
                          className="flex-1 min-h-[44px] rounded-xl bg-[#7A9E7E] px-4 text-xs font-semibold text-[#101611] hover:bg-[#8FB393] disabled:opacity-50"
                        >
                          {busyKey === `approve-${member.id}`
                            ? "Approving..."
                            : "Approve (Photo Verified)"}
                        </button>
                        <button
                          type="button"
                          disabled={busyKey === `reject-${member.id}`}
                          onClick={() =>
                            runAction(`reject-${member.id}`, {
                              action: "reject_photo",
                              userId: member.id,
                            })
                          }
                          className="flex-1 min-h-[44px] rounded-xl border border-[#6E3943] bg-[#291519] px-4 text-xs font-semibold text-[#F2CFD4] hover:bg-[#3A1E24] disabled:opacity-50"
                        >
                          {busyKey === `reject-${member.id}`
                            ? "Rejecting..."
                            : "Reject (Ask to Retake)"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === "safety" && (
          <section className="space-y-6">
            <div className="space-y-3">
              <h2 className="font-serif text-xl text-[#F8F1E7]">
                Safety Reports ({data.reports.length})
              </h2>
              {data.reports.length === 0 ? (
                <div className="rounded-2xl border border-[#F0E2CC]/12 bg-[#171215] p-6 text-center text-xs text-[#A89A90]">
                  No safety reports logged yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {data.reports.map((report) => (
                    <div
                      key={report.id}
                      className="rounded-2xl border border-[#F0E2CC]/15 bg-[#171215] p-4 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              report.status === "pending"
                                ? "bg-[#7A2835]/40 text-[#F4C4CB]"
                                : report.status === "actioned"
                                ? "bg-[#E5C17B]/20 text-[#E5C17B]"
                                : "bg-[#241C20] text-[#A89A90]"
                            }`}
                          >
                            {report.status}
                          </span>
                          <span className="text-xs text-[#A89A90]">
                            {formatShortDate(report.created_at)}
                          </span>
                        </div>
                        {report.room_name && (
                          <span className="text-[11px] text-[#A89A90]">Room: {report.room_name}</span>
                        )}
                      </div>

                      <div className="text-xs space-y-1">
                        <p>
                          <span className="text-[#A89A90]">Reporter:</span>{" "}
                          <span className="text-[#F5EDE2]">{report.reporterDisplay}</span>
                        </p>
                        <p>
                          <span className="text-[#A89A90]">Reported:</span>{" "}
                          <span className="font-semibold text-[#F4C4CB]">
                            {report.reportedDisplay}
                          </span>
                        </p>
                        <p>
                          <span className="text-[#A89A90]">Reason:</span>{" "}
                          <span className="text-[#F8F1E7]">{report.reason}</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {report.status === "pending" && (
                          <button
                            type="button"
                            disabled={busyKey === `rev-${report.id}`}
                            onClick={() =>
                              runAction(`rev-${report.id}`, {
                                action: "review_report",
                                reportId: report.id,
                              })
                            }
                            className="min-h-[40px] px-3.5 rounded-xl border border-[#F0E2CC]/20 bg-[#1F191C] text-xs font-medium text-[#DDD0C2] hover:bg-[#2B2327]"
                          >
                            Mark Reviewed
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyKey === `banrep-${report.id}`}
                          onClick={() =>
                            runAction(`banrep-${report.id}`, {
                              action: "ban_reported",
                              reportId: report.id,
                              identity: report.reported_identity,
                              reason: report.reason,
                            })
                          }
                          className="min-h-[40px] px-3.5 rounded-xl border border-[#6E3943] bg-[#291519] text-xs font-semibold text-[#F2CFD4] hover:bg-[#3A1E24]"
                        >
                          Ban &amp; Suspend Reported User
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="font-serif text-xl text-[#F8F1E7]">
                Suspended Accounts ({data.suspended.length})
              </h2>
              {data.suspended.length === 0 ? (
                <div className="rounded-2xl border border-[#F0E2CC]/12 bg-[#171215] p-5 text-center text-xs text-[#A89A90]">
                  No suspended accounts.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.suspended.map((s) => (
                    <div
                      key={s.identity}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#6E3943] bg-[#211316] p-4"
                    >
                      <div className="text-xs space-y-0.5">
                        <p className="font-semibold text-[#F8F1E7]">{s.displayName}</p>
                        <p className="text-[#D7A8AF]">
                          {s.reason || "Suspended"} (Reports: {s.report_count})
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyKey === `unban-${s.identity}`}
                        onClick={() =>
                          runAction(`unban-${s.identity}`, {
                            action: "unban_identity",
                            identity: s.identity,
                          })
                        }
                        className="min-h-[40px] px-4 rounded-xl bg-[#E5C17B] text-xs font-semibold text-[#1A1310] hover:bg-[#EED093]"
                      >
                        Unban &amp; Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="font-serif text-xl text-[#F8F1E7]">
                Active Pair Blocks ({data.blocks.length})
              </h2>
              {data.blocks.length === 0 ? (
                <div className="rounded-2xl border border-[#F0E2CC]/12 bg-[#171215] p-5 text-center text-xs text-[#A89A90]">
                  No active user blocks.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.blocks.map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F0E2CC]/12 bg-[#171215] p-4"
                    >
                      <div className="text-xs space-y-0.5">
                        <p className="text-[#F5EDE2]">
                          {b.blockerDisplay} blocked {b.blockedDisplay}
                        </p>
                        <p className="text-[#A89A90]">
                          {b.reason || "No reason"} | {formatShortDate(b.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyKey === `delblock-${b.id}`}
                        onClick={() =>
                          runAction(`delblock-${b.id}`, {
                            action: "delete_block",
                            blockId: b.id,
                          })
                        }
                        className="min-h-[40px] px-3.5 rounded-xl border border-[#F0E2CC]/20 bg-[#1F191C] text-xs font-medium text-[#DDD0C2] hover:bg-[#2B2327]"
                      >
                        Remove Block
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "members" && (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {(["all", "active", "waitlisted", "banned"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setMemberFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize border ${
                    memberFilter === status
                      ? "border-[#E5C17B] bg-[#251E18] text-[#F0D9AE]"
                      : "border-[#F0E2CC]/15 bg-[#171215] text-[#A89A90]"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="space-y-2.5">
              {filteredMembers.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl border border-[#F0E2CC]/15 bg-[#171215] p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-serif text-lg text-[#F8F1E7]">
                        {m.display_name}
                        {m.age ? `, ${m.age}` : ""}
                      </span>
                      <span className="rounded-full bg-[#241C20] px-2 py-0.5 text-[10px] uppercase text-[#C9BCB0]">
                        {m.gender}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          m.cohort_status === "active"
                            ? "bg-[#7A9E7E]/20 text-[#9AC19E]"
                            : m.cohort_status === "banned"
                            ? "bg-[#7A2835]/40 text-[#F4C4CB]"
                            : "bg-[#E5C17B]/20 text-[#E5C17B]"
                        }`}
                      >
                        {m.cohort_status}
                      </span>
                    </div>
                    <p className="text-xs text-[#A89A90]">
                      {m.area_label} | Photos: {m.photoSignedUrls.length}/3 (
                      {m.photo_verification_status || "unverified"}) | GPS:{" "}
                      {m.location_verified ? "OK" : "Pending"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {m.cohort_status !== "active" && (
                      <button
                        type="button"
                        disabled={busyKey === `act-${m.id}`}
                        onClick={() =>
                          runAction(`act-${m.id}`, {
                            action: "set_cohort_status",
                            userId: m.id,
                            status: "active",
                          })
                        }
                        className="min-h-[38px] px-3 rounded-xl bg-[#7A9E7E] text-xs font-semibold text-[#101611] hover:bg-[#8FB393]"
                      >
                        Set Active
                      </button>
                    )}
                    {m.cohort_status === "active" && (
                      <button
                        type="button"
                        disabled={busyKey === `wait-${m.id}`}
                        onClick={() =>
                          runAction(`wait-${m.id}`, {
                            action: "set_cohort_status",
                            userId: m.id,
                            status: "waitlisted",
                          })
                        }
                        className="min-h-[38px] px-3 rounded-xl border border-[#F0E2CC]/20 bg-[#1F191C] text-xs font-medium text-[#DDD0C2] hover:bg-[#2B2327]"
                      >
                        Waitlist
                      </button>
                    )}
                    {m.cohort_status !== "banned" && (
                      <button
                        type="button"
                        disabled={busyKey === `ban-${m.id}`}
                        onClick={() =>
                          runAction(`ban-${m.id}`, {
                            action: "set_cohort_status",
                            userId: m.id,
                            status: "banned",
                          })
                        }
                        className="min-h-[38px] px-3 rounded-xl border border-[#6E3943] bg-[#291519] text-xs font-semibold text-[#F2CFD4] hover:bg-[#3A1E24]"
                      >
                        Ban
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 min-h-[44px] min-w-[44px] rounded-full bg-[#1F191C] text-lg font-bold text-[#F5EDE2]"
            aria-label="Close image"
          >
            &times;
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Zoomed verification image"
            className="max-h-[85dvh] max-w-full rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}