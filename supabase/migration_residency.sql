-- Run this in Supabase SQL Editor to add SWFL residency status to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS residency_status TEXT NOT NULL DEFAULT 'year_round'
CHECK (residency_status IN ('year_round', 'seasonal', 'visiting'));

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS open_to_seasonal BOOLEAN NOT NULL DEFAULT TRUE;
