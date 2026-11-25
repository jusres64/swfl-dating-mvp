'use client';

import { useState } from 'react';
import Link from 'next/link';

const SWFL_AREA_OPTIONS = [
  'Punta Gorda area',
  'Port Charlotte area',
  'North Port area',
  'Venice area',
  'Sarasota area',
  'Bradenton area',
  'Fort Myers area',
  'Cape Coral area',
  'Bonita Springs area',
  'Naples area',
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function computeAgePrefs(birthYearStr: string): { min: string; max: string } {
  const year = Number(birthYearStr);
  const currentYear = new Date().getFullYear();
  if (isNaN(year) || year < 1940 || year > currentYear - 18) {
    return { min: '19', max: '39' };
  }
  const age = currentYear - year;
  return {
    min: String(Math.max(18, age - 10)),
    max: String(Math.min(99, age + 10)),
  };
}

export default function JoinPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    displayName: string;
    cohortStatus: 'active' | 'waitlisted';
    spotNumber: number | null;
    cap: number;
  } | null>(null);

  // Step 1: Basics & SWFL Area (Default 1997 = 29 yrs old)
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthYear, setBirthYear] = useState('1997');
  const [gender, setGender] = useState<'man' | 'woman'>('woman');
  const [areaLabel, setAreaLabel] = useState('Punta Gorda area');

  // Step 2: Essential Compatibility (Auto +/- 10 years from birth year)
  const initialPrefs = computeAgePrefs('1997');
  const [intent, setIntent] = useState<'long_term' | 'open_to_long' | 'casual'>('long_term');
  const [wantsKids, setWantsKids] = useState<'yes' | 'no' | 'open' | 'have_and_done'>('open');
  const [smoking, setSmoking] = useState<'non_smoker' | 'smoker' | 'cannabis_only'>('non_smoker');
  const [minAgePref, setMinAgePref] = useState(initialPrefs.min);
  const [maxAgePref, setMaxAgePref] = useState(initialPrefs.max);
  const [maxDriveMiles, setMaxDriveMiles] = useState('45');

  // Step 3: Private Profile Vault
  const [occupation, setOccupation] = useState('');
  const [heightFeet, setHeightFeet] = useState('5');
  const [heightInchesPart, setHeightInchesPart] = useState('7');
  const [firstMeetSpot, setFirstMeetSpot] = useState('');

  const handleBirthYearChange = (val: string) => {
    setBirthYear(val);
    const yearNum = Number(val);
    const currentYear = new Date().getFullYear();
    if (val.length === 4 && !isNaN(yearNum) && yearNum >= 1940 && yearNum <= currentYear - 18) {
      const next = computeAgePrefs(val);
      setMinAgePref(next.min);
      setMaxAgePref(next.max);
    }
  };

  const handleNextStep1 = () => {
    setErrorMsg(null);
    if (!displayName.trim()) {
      setErrorMsg('Please enter your first name.');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setErrorMsg('Please enter a valid email address (used for Sunday Drop reminders and waitlist updates).');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Please choose a password with at least 6 characters.');
      return;
    }
    const yearNum = Number(birthYear);
    const currentYear = new Date().getFullYear();
    if (isNaN(yearNum) || yearNum < 1940 || yearNum > currentYear - 18) {
      setErrorMsg('Please enter a valid 4-digit birth year (must be 18 or older).');
      return;
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!occupation.trim()) {
      setErrorMsg('Please enter your occupation.');
      return;
    }
    if (firstMeetSpot.trim().length < 3) {
      setErrorMsg('Please enter your favorite local SWFL spot for a first meet.');
      return;
    }

    setLoading(true);
    try {
      const totalHeightInches = Number(heightFeet) * 12 + Number(heightInchesPart);
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName,
          birthYear: Number(birthYear),
          gender,
          areaLabel,
          residencyStatus: 'year_round',
          openToSeasonal: true,
          intent,
          minAgePref: Number(minAgePref),
          maxAgePref: Number(maxAgePref),
          maxDriveMiles: Number(maxDriveMiles),
          wantsKids,
          smoking,
          occupation: occupation.trim(),
          heightInches: totalHeightInches,
          firstMeetSpot: firstMeetSpot.trim(),
          firstMeetPlace: null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || `Signup failed (HTTP ${res.status}).`);
        return;
      }
      setResult(data);
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const isActive = result.cohortStatus === 'active';
    return (
      <main className="relative min-h-screen bg-[#161412] text-[#F5F0EB] flex items-center justify-center p-6 overflow-hidden">
        <div className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full bg-[#D96B52]/12 blur-[110px]" />
        </div>

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-[#F5F0EB]/12 bg-[#231F1C]/95 backdrop-blur-xl p-8 space-y-6 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#E5C185]/40 bg-[#E5C185]/15 text-[#E5C185]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-5 w-5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#E5C185]">
              {isActive
                ? `Founding Spot #${result.spotNumber} of ${result.cap}`
                : 'Priority Waitlist'}
            </p>
            <h1 className="font-serif text-3xl text-[#F5F0EB]">
              {isActive ? `Welcome in, ${result.displayName}.` : `You are on the list, ${result.displayName}.`}
            </h1>
            <p className="text-xs text-[#C2B9B0] leading-relaxed">
              {isActive
                ? 'Your spot in the 50/50 Southwest Florida Founding Beta is reserved. Your Private Vault stays hidden until you both choose to match after a live call.'
                : 'Our first 50 spots for your group are currently full so we can keep Sunday Live Drops balanced. You will be notified first as soon as a spot opens.'}
            </p>
          </div>

          <div className="rounded-2xl border border-[#F5F0EB]/10 bg-[#161412] p-4 text-left text-xs space-y-1.5 text-[#C2B9B0]">
            <p className="font-medium text-[#F5F0EB]">Next Steps</p>
            <p>&bull; Sunday Live Drops run from 8:00 PM to 9:00 PM EST.</p>
            <p>&bull; You can test your mic and preview the voice-first room right now.</p>
          </div>

          <div className="space-y-2.5">
            <Link
              href="/call"
              className="block w-full rounded-2xl bg-[#D96B52] hover:bg-[#c85e46] py-3.5 text-sm font-semibold text-[#F5F0EB] transition"
            >
              Preview the Live Call Room
            </Link>
            <Link
              href="/"
              className="block w-full rounded-2xl border border-[#F5F0EB]/12 bg-[#161412] hover:bg-[#1c1917] py-3 text-xs font-medium text-[#C2B9B0] transition"
            >
              Back to Overview
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[#161412] text-[#F5F0EB] flex items-center justify-center p-6 overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-28 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-[#D96B52]/12 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[#C2B9B0] hover:text-[#F5F0EB] transition"
          >
            &larr; Back
          </Link>
          <span className="text-[11px] font-medium text-[#E5C185]">Step {step} of 3</span>
        </div>

        <div className="h-1 w-full rounded-full bg-[#231F1C] overflow-hidden">
          <div
            className="h-full bg-[#E5C185] transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        <div className="rounded-3xl border border-[#F5F0EB]/12 bg-[#231F1C]/92 backdrop-blur-xl p-7 space-y-6 shadow-2xl">
          {errorMsg && (
            <div className="rounded-2xl border border-[#C85A5A]/50 bg-[#C85A5A]/15 px-4 py-3 text-xs text-[#F5F0EB] break-words">
              {errorMsg}
            </div>
          )}

          {/* STEP 1: BASICS & SWFL AREA */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E5C185]">
                  Founding Cohort 01 (50 Men / 50 Women)
                </p>
                <h1 className="font-serif text-2xl text-[#F5F0EB]">The basics</h1>
                <p className="text-xs text-[#C2B9B0] leading-relaxed">
                  Cohort 1 is exclusively for Southwest Florida locals, capped at 50 men and 50 women so nobody sits in an empty live queue.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Jordan"
                    className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3.5 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                      I am a
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as 'man' | 'woman')}
                      className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                    >
                      <option value="woman">Woman</option>
                      <option value="man">Man</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                      Birth Year
                    </label>
                    <input
                      type="number"
                      value={birthYear}
                      onChange={(e) => handleBirthYearChange(e.target.value)}
                      placeholder="1997"
                      className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3.5 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                    General SWFL Area
                  </label>
                  <select
                    value={areaLabel}
                    onChange={(e) => setAreaLabel(e.target.value)}
                    className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                  >
                    {SWFL_AREA_OPTIONS.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3.5 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                  />
                  <p className="mt-1 text-[11px] text-[#C2B9B0]">
                    Private. Used only for Sunday 8:00 PM Drop reminders and waitlist updates.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3.5 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                  />
                </div>
              </div>

              <button
                onClick={handleNextStep1}
                className="w-full rounded-2xl bg-[#D96B52] hover:bg-[#c85e46] py-3.5 text-sm font-semibold text-[#F5F0EB] transition"
              >
                Continue to Compatibility
              </button>
            </div>
          )}

          {/* STEP 2: ESSENTIAL COMPATIBILITY */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E5C185]">
                  Hide Photos, Not Dealbreakers
                </p>
                <h1 className="font-serif text-2xl text-[#F5F0EB]">Essential compatibility</h1>
                <p className="text-xs text-[#C2B9B0] leading-relaxed">
                  We use these to pair you with people who want the same things, so you never waste a conversation on basic mismatches.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                    Relationship Intention
                  </label>
                  <select
                    value={intent}
                    onChange={(e) => setIntent(e.target.value as any)}
                    className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                  >
                    <option value="long_term">Long-term relationship</option>
                    <option value="open_to_long">Open to long-term</option>
                    <option value="casual">Casual dating</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                      Children
                    </label>
                    <select
                      value={wantsKids}
                      onChange={(e) => setWantsKids(e.target.value as any)}
                      className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                    >
                      <option value="open">Open to kids</option>
                      <option value="yes">Want kids</option>
                      <option value="have_and_done">Have kids, done</option>
                      <option value="no">Do not want kids</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                      Smoking
                    </label>
                    <select
                      value={smoking}
                      onChange={(e) =>
                        setSmoking(e.target.value as 'non_smoker' | 'smoker' | 'cannabis_only')
                      }
                      className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                    >
                      <option value="non_smoker">Non-smoker</option>
                      <option value="smoker">Smoker</option>
                      <option value="cannabis_only">Cannabis only</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                      Min Age
                    </label>
                    <input
                      type="number"
                      value={minAgePref}
                      onChange={(e) => setMinAgePref(e.target.value)}
                      className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                      Max Age
                    </label>
                    <input
                      type="number"
                      value={maxAgePref}
                      onChange={(e) => setMaxAgePref(e.target.value)}
                      className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                      Max Miles
                    </label>
                    <input
                      type="number"
                      value={maxDriveMiles}
                      onChange={(e) => setMaxDriveMiles(e.target.value)}
                      className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setStep(1)}
                  className="w-1/3 rounded-2xl border border-[#F5F0EB]/15 bg-[#161412] py-3.5 text-xs font-medium text-[#C2B9B0] hover:text-[#F5F0EB] transition"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 rounded-2xl bg-[#D96B52] hover:bg-[#c85e46] py-3.5 text-sm font-semibold text-[#F5F0EB] transition"
                >
                  Continue to Vault
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PRIVATE PROFILE VAULT */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E5C185]">
                  Locked Until Mutual Match
                </p>
                <h1 className="font-serif text-2xl text-[#F5F0EB]">Your Private Vault</h1>
                <p className="text-xs text-[#C2B9B0] leading-relaxed">
                  Nobody can browse these details. Everything below stays hidden until you both choose to match after a live call.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                    Occupation <span className="text-[#D96B52]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder="e.g. Architect, Nurse, Small Business Owner"
                    className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3.5 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                      Height (Feet)
                    </label>
                    <select
                      value={heightFeet}
                      onChange={(e) => setHeightFeet(e.target.value)}
                      className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                    >
                      <option value="4">4 ft</option>
                      <option value="5">5 ft</option>
                      <option value="6">6 ft</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0] mb-1">
                      Height (Inches)
                    </label>
                    <select
                      value={heightInchesPart}
                      onChange={(e) => setHeightInchesPart(e.target.value)}
                      className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3 py-2.5 text-sm text-[#F5F0EB] focus:outline-none focus:border-[#E5C185]"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i} value={String(i)}>
                          {i} in
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-[#C2B9B0]">
                    Favorite Local Spot for a First Meet <span className="text-[#D96B52]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={firstMeetSpot}
                    onChange={(e) => setFirstMeetSpot(e.target.value)}
                    placeholder="e.g. Downtown Kava, Fishermen's Village, or Bayfront Park"
                    className="w-full rounded-xl border border-[#F5F0EB]/15 bg-[#161412] px-3.5 py-2.5 text-sm text-[#F5F0EB] placeholder-[#C2B9B0]/45 focus:outline-none focus:border-[#E5C185]"
                  />

                  <div className="flex items-start gap-2 rounded-xl border border-[#E5C185]/20 bg-[#161412]/70 px-3 py-2 text-[11px] text-[#C2B9B0] leading-relaxed">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#E5C185]"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>
                      Stays hidden until you both match after a call, making it easy to suggest a real-life meet if you hit it off.
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="w-1/3 rounded-2xl border border-[#F5F0EB]/15 bg-[#161412] py-3.5 text-xs font-medium text-[#C2B9B0] hover:text-[#F5F0EB] transition"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 rounded-2xl bg-[#D96B52] hover:bg-[#c85e46] py-3.5 text-sm font-semibold text-[#F5F0EB] disabled:opacity-50 transition"
                >
                  {loading ? 'Reserving Spot...' : 'Reserve My Spot'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}