"use client";

import React, { useState } from "react";

export type EditableUserProfile = {
  id: string;
  gender: "man" | "woman";
  cohort_status: string;
  display_name: string;
  birth_year: number;
  area_label: string;
  intent: string;
  intents?: string[] | null;
  min_age_pref: number;
  max_age_pref: number;
  max_drive_miles: number;
  wants_kids?: string | null;
  partner_kids_pref?: string | null;
  smoking: string | null;
  occupation: string | null;
  bio_prompts?: Array<{ question?: string; answer?: string }> | null;
};

const SWFL_CORRIDORS = [
  "Charlotte County (Punta Gorda / Port Charlotte)",
  "Sarasota & Manatee (Sarasota / Bradenton / Venice / North Port)",
  "Lee County (Fort Myers / Cape Coral / Bonita Springs)",
  "Collier County (Naples / Marco Island)",
];

const INTENT_OPTIONS = [
  { value: "long_term", label: "Long-term relationship" },
  { value: "casual", label: "Casual dating" },
  { value: "seeing_where_it_goes", label: "Just seeing where it goes" },
] as const;

function mapLegacyArea(areaLabel?: string | null): string {
  const raw = areaLabel || "";
  if (SWFL_CORRIDORS.includes(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower.includes("punta gorda") || lower.includes("port charlotte") || lower.includes("charlotte")) {
    return SWFL_CORRIDORS[0];
  }
  if (
    lower.includes("sarasota") ||
    lower.includes("bradenton") ||
    lower.includes("venice") ||
    lower.includes("north port")
  ) {
    return SWFL_CORRIDORS[1];
  }
  if (
    lower.includes("fort myers") ||
    lower.includes("cape coral") ||
    lower.includes("bonita") ||
    lower.includes("lee")
  ) {
    return SWFL_CORRIDORS[2];
  }
  if (lower.includes("naples") || lower.includes("marco") || lower.includes("collier")) {
    return SWFL_CORRIDORS[3];
  }
  return SWFL_CORRIDORS[0];
}

function mapLegacyIntents(profile: EditableUserProfile): string[] {
  if (Array.isArray(profile.intents) && profile.intents.length > 0) {
    return profile.intents;
  }
  if (profile.intent === "open_to_long") return ["long_term", "seeing_where_it_goes"];
  if (profile.intent === "casual") return ["casual"];
  return ["long_term"];
}

function mapLegacyKids(val?: string | null): string {
  if (
    val === "have_open_to_more" ||
    val === "have_and_done" ||
    val === "no_want" ||
    val === "no_open" ||
    val === "no_none"
  ) {
    return val;
  }
  if (val === "yes") return "no_want";
  if (val === "no") return "no_none";
  return "no_open";
}

function mapLegacySmoking(val?: string | null): string {
  if (
    val === "non_smoker" ||
    val === "tobacco_vape" ||
    val === "cannabis_only" ||
    val === "both_tobacco_cannabis"
  ) {
    return val;
  }
  if (val === "smoker" || val === "regularly" || val === "occasionally") {
    return "tobacco_vape";
  }
  return "non_smoker";
}

type Props = {
  profile: EditableUserProfile;
  onBack: () => void;
  onSaved: (updated: EditableUserProfile) => void;
};

export default function EditPreferencesView({ profile, onBack, onSaved }: Props) {
  const [areaLabel, setAreaLabel] = useState(mapLegacyArea(profile.area_label));
  const [minAgePref, setMinAgePref] = useState(String(profile.min_age_pref ?? 19));
  const [maxAgePref, setMaxAgePref] = useState(String(profile.max_age_pref ?? 39));
  const [maxDriveMiles, setMaxDriveMiles] = useState(String(profile.max_drive_miles ?? 45));
  const [intents, setIntents] = useState<string[]>(mapLegacyIntents(profile));
  const [wantsKids, setWantsKids] = useState(mapLegacyKids(profile.wants_kids));
  const [partnerKidsPref, setPartnerKidsPref] = useState(
    profile.partner_kids_pref === "prefer_no_kids" ? "prefer_no_kids" : "open_to_kids"
  );
  const [smoking, setSmoking] = useState(mapLegacySmoking(profile.smoking));
  const [occupation, setOccupation] = useState(profile.occupation || "");
  const [firstMeetSpot, setFirstMeetSpot] = useState(
    Array.isArray(profile.bio_prompts) ? profile.bio_prompts[0]?.answer || "" : ""
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const myAge = profile.birth_year ? new Date().getFullYear() - profile.birth_year : null;

  const toggleIntent = (val: string) => {
    setIntents((prev) =>
      prev.includes(val) ? prev.filter((item) => item !== val) : [...prev, val]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (intents.length === 0) {
      setErrorMsg("Please check at least one option under What are you open to.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaLabel,
          minAgePref: Number(minAgePref),
          maxAgePref: Number(maxAgePref),
          maxDriveMiles: Number(maxDriveMiles),
          intents,
          wantsKids,
          partnerKidsPref,
          smoking,
          occupation: occupation.trim(),
          firstMeetSpot: firstMeetSpot.trim(),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        profile?: EditableUserProfile;
        error?: string;
      };

      if (!res.ok || !data.profile) {
        setErrorMsg(data.error || "Could not save preferences.");
        return;
      }

      onSaved(data.profile);
    } catch {
      setErrorMsg("Network error while saving preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#0E0B0D] text-[#F5EDE2] flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 py-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] px-3 rounded-xl border border-[#F0E2CC]/15 bg-[#171215] text-xs font-medium text-[#E6DACB] hover:bg-[#241C20]"
          >
            &larr; Back to Green Room
          </button>
          {myAge !== null && (
            <span className="text-xs font-medium text-[#E5C17B]">Your age: {myAge}</span>
          )}
        </div>

        <div className="rounded-3xl border border-[#F0E2CC]/18 bg-[#171215] p-6 shadow-2xl">
          <div className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E5C17B]">
              Match Settings &amp; Private Vault
            </p>
            <h1 className="mt-1 font-serif text-2xl font-medium text-[#F8F1E7]">
              Edit Preferences
            </h1>
            <p className="mt-1 text-xs text-[#A89A90]">
              Updates save right away and apply immediately in the Green Room queue.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {errorMsg && (
              <div className="rounded-xl border border-[#8E434F] bg-[#31171C] px-3.5 py-2.5 text-xs text-[#F4C4CB]">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1">
                SWFL County / Corridor
              </label>
              <select
                value={areaLabel}
                onChange={(e) => setAreaLabel(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-3 text-sm text-[#F8F1E7] focus:border-[#E5C17B] focus:outline-none"
              >
                {SWFL_CORRIDORS.map((corridor) => (
                  <option key={corridor} value={corridor}>
                    {corridor}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1.5">
                Age &amp; Distance Range
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-[#A89A90] mb-1">Min Age</label>
                  <input
                    type="number"
                    min={18}
                    max={99}
                    value={minAgePref}
                    onChange={(e) => setMinAgePref(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-3 text-sm text-[#F8F1E7] focus:border-[#E5C17B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#A89A90] mb-1">Max Age</label>
                  <input
                    type="number"
                    min={18}
                    max={99}
                    value={maxAgePref}
                    onChange={(e) => setMaxAgePref(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-3 text-sm text-[#F8F1E7] focus:border-[#E5C17B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#A89A90] mb-1">Max Miles</label>
                  <input
                    type="number"
                    min={5}
                    max={150}
                    value={maxDriveMiles}
                    onChange={(e) => setMaxDriveMiles(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-3 text-sm text-[#F8F1E7] focus:border-[#E5C17B] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1.5">
                What are you open to?
              </label>
              <div className="space-y-2">
                {INTENT_OPTIONS.map((opt) => {
                  const checked = intents.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm cursor-pointer transition ${
                        checked
                          ? "border-[#E5C17B]/60 bg-[#2A221A] text-[#F8F1E7]"
                          : "border-[#F0E2CC]/15 bg-[#100C0E] text-[#C9BCB0]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleIntent(opt.value)}
                        className="h-4 w-4 accent-[#E5C17B]"
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1">
                  Your Kids Situation
                </label>
                <select
                  value={wantsKids}
                  onChange={(e) => setWantsKids(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-3 text-sm text-[#F8F1E7] focus:border-[#E5C17B] focus:outline-none"
                >
                  <option value="no_open">No kids, open to them</option>
                  <option value="no_want">No kids, want them</option>
                  <option value="no_none">No kids, do not want them</option>
                  <option value="have_open_to_more">Have kids, open to more</option>
                  <option value="have_and_done">Have kids, done</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1">
                  Dating Someone With Kids
                </label>
                <select
                  value={partnerKidsPref}
                  onChange={(e) => setPartnerKidsPref(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-3 text-sm text-[#F8F1E7] focus:border-[#E5C17B] focus:outline-none"
                >
                  <option value="open_to_kids">Open to dating someone with kids</option>
                  <option value="prefer_no_kids">Prefer someone without kids</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1">
                  Smoking &amp; Cannabis
                </label>
                <select
                  value={smoking}
                  onChange={(e) => setSmoking(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-3 text-sm text-[#F8F1E7] focus:border-[#E5C17B] focus:outline-none"
                >
                  <option value="non_smoker">Non-smoker</option>
                  <option value="tobacco_vape">Tobacco / vape</option>
                  <option value="cannabis_only">Cannabis only</option>
                  <option value="both_tobacco_cannabis">Both tobacco &amp; cannabis</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1">
                  Occupation (Private Vault)
                </label>
                <input
                  type="text"
                  required
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="e.g. Architect, Nurse, Small Business Owner"
                  className="w-full min-h-[44px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-3.5 text-sm text-[#F8F1E7] focus:border-[#E5C17B] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-[#A89A90] mb-1">
                  Favorite Local First-Meet Spot (Private Vault)
                </label>
                <input
                  type="text"
                  required
                  value={firstMeetSpot}
                  onChange={(e) => setFirstMeetSpot(e.target.value)}
                  placeholder="e.g. Downtown Kava, Fishermen's Village, or Bayfront Park"
                  className="w-full min-h-[44px] rounded-xl border border-[#F0E2CC]/20 bg-[#100C0E] px-3.5 text-sm text-[#F8F1E7] focus:border-[#E5C17B] focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2.5">
              <button
                type="button"
                onClick={onBack}
                disabled={saving}
                className="w-1/3 min-h-[48px] rounded-xl border border-[#F0E2CC]/20 bg-[#1F191C] text-xs font-medium text-[#DDD0C2] hover:bg-[#2B2327]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 min-h-[48px] rounded-xl bg-[#E5C17B] text-sm font-semibold text-[#1A1310] hover:bg-[#EED093] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Preferences"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}