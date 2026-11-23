import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="relative min-h-screen bg-[#161412] text-[#F5F0EB] overflow-hidden">
      {/* Warm ambient dusk glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[420px] w-[520px] rounded-full bg-[#D96B52]/12 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[320px] w-[320px] rounded-full bg-[#E5C185]/8 blur-[110px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-between px-6 py-8">
        {/* Top Minimal Brand Bar */}
        <header className="flex items-center justify-between border-b border-[#F5F0EB]/10 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E5C185]/35 bg-[#231F1C] font-serif text-sm font-semibold text-[#E5C185]">
              S
            </span>
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-[#F5F0EB]">
                SWFL Beta
              </p>
              <p className="text-[11px] text-[#C2B9B0]">Founding Cohort 01</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#7A9E7E]/30 bg-[#7A9E7E]/10 px-3 py-1 text-[11px] font-medium text-[#9AC19E]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7A9E7E]" />
            Sundays, 8 PM
          </span>
        </header>

        {/* Main Editorial Hero */}
        <section className="my-10 space-y-8">
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#E5C185]">
              50 Men &bull; 50 Women &bull; Southwest Florida
            </p>
            <h1 className="font-serif text-4xl font-medium tracking-tight text-[#F5F0EB] leading-[1.12] sm:text-5xl">
              Skip the swipe fatigue. Start with a real voice.
            </h1>
            <p className="text-[15px] leading-relaxed text-[#C2B9B0]">
              Voice-first dating for people looking for something real in Southwest Florida. Hide the photo, not the compatibility, and unlock live video only when you both choose to.
            </p>
          </div>

          {/* Primary & Secondary CTA Block */}
          <div className="space-y-3">
            <Link
              href="/join"
              className="group flex w-full items-center justify-between rounded-2xl bg-[#D96B52] hover:bg-[#c85e46] px-6 py-4 text-sm font-semibold text-[#F5F0EB] shadow-xl shadow-[#D96B52]/15 transition"
            >
              <span>Join Founding Cohort (50/50 Cap)</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>

            <Link
              href="/call"
              className="block w-full text-center rounded-2xl border border-[#F5F0EB]/14 bg-[#231F1C]/80 hover:bg-[#231F1C] px-6 py-3.5 text-xs font-medium text-[#E5C185] transition"
            >
              Preview Live Call Sandbox
            </Link>

            <p className="text-center text-xs text-[#C2B9B0]">
              Zero public browsing. Zero inbox bombardment.
            </p>
          </div>

          {/* 3-Step Visual Rhythm */}
          <div className="rounded-3xl border border-[#F5F0EB]/10 bg-[#231F1C]/80 backdrop-blur-md p-5 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C2B9B0]">
              How Sunday Night Works
            </p>
            <div className="space-y-3.5">
              <div className="flex items-start gap-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E5C185]/30 bg-[#161412] text-xs font-serif text-[#E5C185]">
                  1
                </span>
                <div>
                  <p className="text-sm font-medium text-[#F5F0EB]">Voice-First Introduction</p>
                  <p className="text-xs text-[#C2B9B0] leading-relaxed">
                    See essential compatibility up front, then start with a real hello.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E5C185]/30 bg-[#161412] text-xs font-serif text-[#E5C185]">
                  2
                </span>
                <div>
                  <p className="text-sm font-medium text-[#F5F0EB]">Private Mutual Reveal</p>
                  <p className="text-xs text-[#C2B9B0] leading-relaxed">
                    Your camera stays private until you both tap Request Video.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E5C185]/30 bg-[#161412] text-xs font-serif text-[#E5C185]">
                  3
                </span>
                <div>
                  <p className="text-sm font-medium text-[#F5F0EB]">Zero-Pressure Exit</p>
                  <p className="text-xs text-[#C2B9B0] leading-relaxed">
                    Decide privately after the call. Your inbox only opens when both people say yes.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Green Room Local Partner Slot */}
          <div className="rounded-3xl border border-[#E5C185]/20 bg-gradient-to-br from-[#231F1C] to-[#1B1815] p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E5C185]">
                Green Room Spotlight
              </span>
              <span className="rounded-full bg-[#7A9E7E]/15 px-2.5 py-0.5 text-[10px] font-medium text-[#9AC19E] border border-[#7A9E7E]/25">
                Local Partner Slot
              </span>
            </div>
            <p className="font-serif text-lg text-[#F5F0EB]">
              SWFL Waterfront &amp; Date-Night Venues
            </p>
            <p className="text-xs text-[#C2B9B0] leading-relaxed">
              Reserved for curated Punta Gorda, Sarasota, and Fort Myers spots featured in the Green Room before each Sunday Drop.
            </p>
          </div>
        </section>

        {/* Footer Trust Strip */}
        <footer className="flex items-center justify-between border-t border-[#F5F0EB]/10 pt-4 text-[11px] text-[#C2B9B0]">
          <span>Photo &amp; Liveness Verified</span>
          <span>1-Tap Safety Exit</span>
        </footer>
      </div>
    </main>
  );
}
