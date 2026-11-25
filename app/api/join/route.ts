import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const SWFL_AREAS: Record<string, { lat: number; lng: number }> = {
  'Punta Gorda area': { lat: 26.9298, lng: -82.0454 },
  'Port Charlotte area': { lat: 26.9762, lng: -82.0906 },
  'North Port area': { lat: 27.0442, lng: -82.2359 },
  'Venice area': { lat: 27.0998, lng: -82.4543 },
  'Sarasota area': { lat: 27.3364, lng: -82.5307 },
  'Bradenton area': { lat: 27.4989, lng: -82.5748 },
  'Fort Myers area': { lat: 26.6406, lng: -81.8723 },
  'Cape Coral area': { lat: 26.5629, lng: -81.9495 },
  'Bonita Springs area': { lat: 26.3398, lng: -81.7787 },
  'Naples area': { lat: 26.1420, lng: -81.7948 },
};

const VALID_SMOKING = new Set(['non_smoker', 'smoker', 'cannabis_only']);
const COHORT_CAP_PER_GENDER = 50;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatError(step: string, err: any): string {
  if (!err) return `${step}: Unknown error`;
  const parts = [
    err.message,
    err.code ? `code=${err.code}` : '',
    err.details ? `details=${err.details}` : '',
    err.hint ? `hint=${err.hint}` : '',
    err.status ? `status=${err.status}` : '',
  ].filter(Boolean);

  if (parts.length > 0) {
    return `${step}: ${parts.join(' | ')}`;
  }
  try {
    return `${step}: ${JSON.stringify(err)}`;
  } catch {
    return `${step}: Unexpected error`;
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Server config error: Missing Supabase URL or Service Role Key in .env.local.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const {
      email,
      password,
      displayName,
      birthYear,
      gender,
      areaLabel,
      residencyStatus,
      openToSeasonal,
      intent,
      minAgePref,
      maxAgePref,
      maxDriveMiles,
      wantsKids,
      smoking,
      occupation,
      heightInches,
      firstMeetSpot,
      firstMeetPlace,
    } = body;

    if (!email || !password || !displayName || !birthYear || !gender || !areaLabel || !intent) {
      return NextResponse.json({ error: 'Please complete all required fields.' }, { status: 400 });
    }

    const cleanOccupation = String(occupation || '').trim();
    if (!cleanOccupation) {
      return NextResponse.json({ error: 'Please enter your occupation.' }, { status: 400 });
    }

    const cleanSpot = String(firstMeetSpot || '').trim();
    if (!cleanSpot) {
      return NextResponse.json(
        { error: 'Please enter or locate your favorite local spot for a first meet.' },
        { status: 400 }
      );
    }

    const cleanSmoking = VALID_SMOKING.has(String(smoking)) ? String(smoking) : 'non_smoker';

    const cleanEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address (e.g. name@example.com).' },
        { status: 400 }
      );
    }

    if (gender !== 'man' && gender !== 'woman') {
      return NextResponse.json(
        { error: 'Cohort 1 is scoped to men and women seeking each other.' },
        { status: 400 }
      );
    }

    const coords = SWFL_AREAS[areaLabel] || SWFL_AREAS['Punta Gorda area'];

    const { count: activeCount, error: countError } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact' })
      .eq('gender', gender)
      .eq('cohort_status', 'active');

    if (countError) {
      return NextResponse.json(
        { error: formatError('Cohort cap check failed', countError) },
        { status: 500 }
      );
    }

    const currentActive = activeCount || 0;
    const cohortStatus = currentActive < COHORT_CAP_PER_GENDER ? 'active' : 'waitlisted';

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: formatError('Auth signup failed', authError) },
        { status: 400 }
      );
    }

    const bioPrompts = [
      {
        question: 'Favorite first-meet spot',
        answer: cleanSpot,
        place: firstMeetPlace || null,
      },
    ];

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: authData.user.id,
      gender,
      cohort_status: cohortStatus,
      display_name: displayName.trim(),
      birth_year: Number(birthYear),
      area_label: areaLabel,
      approx_lat: coords.lat,
      approx_lng: coords.lng,
      residency_status: residencyStatus || 'year_round',
      open_to_seasonal: openToSeasonal !== false,
      intent,
      min_age_pref: Number(minAgePref) || 28,
      max_age_pref: Number(maxAgePref) || 44,
      max_drive_miles: Number(maxDriveMiles) || 45,
      wants_kids: wantsKids || 'open',
      smoking: cleanSmoking,
      occupation: cleanOccupation,
      height_inches: heightInches ? Number(heightInches) : null,
      bio_prompts: bioPrompts,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return NextResponse.json(
        { error: formatError('Profile save failed', profileError) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      userId: authData.user.id,
      displayName: displayName.trim(),
      cohortStatus,
      spotNumber: cohortStatus === 'active' ? currentActive + 1 : null,
      cap: COHORT_CAP_PER_GENDER,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: formatError('Unexpected server error', err) },
      { status: 500 }
    );
  }
}