-- Run this in Supabase SQL Editor to ensure the profiles table and all columns exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gender TEXT NOT NULL CHECK (gender IN ('man', 'woman')),
  cohort_status TEXT NOT NULL DEFAULT 'active' CHECK (cohort_status IN ('active', 'waitlisted')),
  display_name TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  area_label TEXT NOT NULL,
  approx_lat DOUBLE PRECISION,
  approx_lng DOUBLE PRECISION,
  residency_status TEXT NOT NULL DEFAULT 'year_round' CHECK (residency_status IN ('year_round', 'seasonal', 'visiting')),
  open_to_seasonal BOOLEAN NOT NULL DEFAULT TRUE,
  intent TEXT NOT NULL,
  min_age_pref INTEGER NOT NULL DEFAULT 28,
  max_age_pref INTEGER NOT NULL DEFAULT 44,
  max_drive_miles INTEGER NOT NULL DEFAULT 45,
  wants_kids TEXT NOT NULL DEFAULT 'open',
  smoking TEXT NOT NULL DEFAULT 'never',
  occupation TEXT,
  height_inches INTEGER,
  bio_prompts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS residency_status TEXT NOT NULL DEFAULT 'year_round';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS open_to_seasonal BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS height_inches INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio_prompts JSONB NOT NULL DEFAULT '[]'::jsonb;
