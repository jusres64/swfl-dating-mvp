-- Run this entire script inside your Supabase Dashboard -> SQL Editor

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  gender TEXT NOT NULL CHECK (gender IN ('man', 'woman')),
  cohort_status TEXT NOT NULL DEFAULT 'waitlisted'
    CHECK (cohort_status IN ('active', 'waitlisted', 'standby', 'paused', 'banned')),
  rsvp_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  waitlist_priority INT DEFAULT 0,

  photo_matched BOOLEAN DEFAULT FALSE,
  liveness_checked BOOLEAN DEFAULT FALSE,
  age_checked BOOLEAN DEFAULT FALSE,
  verification_video_path TEXT,

  display_name TEXT NOT NULL,
  birth_year INT NOT NULL,
  area_label TEXT NOT NULL,
  approx_lat DOUBLE PRECISION NOT NULL,
  approx_lng DOUBLE PRECISION NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('long_term', 'open_to_long', 'casual')),

  min_age_pref INT NOT NULL DEFAULT 25,
  max_age_pref INT NOT NULL DEFAULT 40,
  max_drive_miles INT NOT NULL DEFAULT 60,
  wants_kids TEXT CHECK (wants_kids IN ('yes', 'no', 'open', 'have_and_done')),
  smoking TEXT CHECK (smoking IN ('never', 'occasionally', 'regularly')),

  occupation TEXT,
  height_inches INT,
  bio_prompts JSONB DEFAULT '[]'::jsonb,
  photo_urls TEXT[] DEFAULT '{}',

  hashed_device_id TEXT
);

CREATE TABLE public.live_queue (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  gender TEXT NOT NULL CHECK (gender IN ('man', 'woman')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched')),
  prefer_voice_first BOOLEAN DEFAULT TRUE
);

CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  livekit_room_name TEXT UNIQUE NOT NULL,

  man_id UUID NOT NULL REFERENCES public.profiles(id),
  woman_id UUID NOT NULL REFERENCES public.profiles(id),

  man_reveal_stage INT NOT NULL DEFAULT 0,
  woman_reveal_stage INT NOT NULL DEFAULT 0,
  active_reveal_stage INT GENERATED ALWAYS AS (LEAST(man_reveal_stage, woman_reveal_stage)) STORED,

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'terminated_safety'))
);

CREATE TABLE public.call_decisions (
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('continue', 'not_a_match', 'report')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (call_id, user_id)
);

CREATE TABLE public.blocks_and_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id),
  reported_id UUID NOT NULL REFERENCES public.profiles(id),
  call_id UUID REFERENCES public.calls(id),
  severity_tier TEXT CHECK (severity_tier IN ('tier_1', 'tier_2', 'tier_3', 'block_only')),
  reason_code TEXT,
  auto_flagged BOOLEAN DEFAULT FALSE,
  mod_reviewed BOOLEAN DEFAULT FALSE,
  mod_action TEXT
);

CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  call_id UUID UNIQUE REFERENCES public.calls(id),
  man_id UUID NOT NULL REFERENCES public.profiles(id),
  woman_id UUID NOT NULL REFERENCES public.profiles(id)
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  body TEXT,
  voice_note_url TEXT
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
