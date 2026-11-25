import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { attachSessionCookie } from '@/lib/authSession';

const SWFL_AREAS: Record<string, { lat: number; lng: number }> = {
  // 4 clear SWFL corridors
  'Charlotte County (Punta Gorda / Port Charlotte)': { lat: 26.953, lng: -82.068 },
  'Sarasota & Manatee (Sarasota / Bradenton / Venice / North Port)': { lat: 27.27, lng: -82.48 },
  'Lee County (Fort Myers / Cape Coral / Bonita Springs)': { lat: 26.58, lng: -81.88 },
  'Collier County (Naples / Marco Island)': { lat: 26.142, lng: -81.7948 },
  // Legacy city fallbacks
  'Punta Gorda area': { lat: 26.9298, lng: -82.0454 },
  'Port Charlotte area': { lat: 26.9762, lng: -82.0906 },
  'North Port area': { lat: 27.0442, lng: -82.2359 },
  'Venice area': { lat: 27.0998, lng: -82.4543 },
  'Sarasota area': { lat: 27.3364, lng: -82.5307 },
  'Bradenton area': { lat: 27.4989, lng: -82.5748 },
  'Fort Myers area': { lat: 26.6406, lng: -81.8723 },
  'Cape Coral area': { lat: 26.5629, lng: -81.9495 },
  'Bonita Springs area': { lat: 26.3398, lng: -81.7787 },
  'Naples area': { lat: 26.142, lng: -81.7948 },
};

const VALID_SMOKING = new Set([
  'non_smoker',
  'tobacco_vape',
  'cannabis_only',
  'both_tobacco_cannabis',
]);
const VALID_INTENTS = new Set(['long_term', 'casual', 'seeing_where_it_goes']);
const VALID_KIDS = new Set([
  'have_open_to_more',
  'have_and_done',
  'no_want',
  'no_open',
  'no_none',
]);
const VALID_PARTNER_KIDS = new Set(['open_to_kids', 'prefer_no_kids']);

const COHORT_CAP_PER_GENDER = 50;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatError(step: string, err: any): string {
  if (!err) return `${step}: Unknown error`;
  const msg = String(err.message || '');
  if (msg.toLowerCase().includes('already been registered') || msg.toLowerCase().includes('already exists')) {
    return 'An account with this email already exists. Go to Sign In or use Forgot Password to reset it.';
  }
  const parts = [
    err.message,
    err.code ? `code=${err.code}` : '',
    err.details ? `details=${err.details}` : '',
    err.hint ? `hint=${err.hint}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? `${step}: ${parts.join(' | ')}` : `${step}: Unexpected error`;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Server config error: Missing Supabase URL or Service Role Key.' },
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
      intents,
      intent,
      minAgePref,
      maxAgePref,
      maxDriveMiles,
      wantsKids,
      partnerKidsPref,
      smoking,
      occupation,
      heightInches,
      firstMeetSpot,
    } = body;

    if (!email || !password || !displayName || !birthYear || !gender || !areaLabel) {
      return NextResponse.json({ error: 'Please complete all required fields.' }, { status: 400 });
    }

    const cleanOccupation = String(occupation || '').trim();
    if (!cleanOccupation) {
      return NextResponse.json({ error: 'Please enter your occupation.' }, { status: 400 });
    }

    const cleanSpot = String(firstMeetSpot || '').trim();
    if (!cleanSpot) {
      return NextResponse.json(
        { error: 'Please enter your favorite local spot for a first meet.' },
        { status: 400 }
      );
    }

    const cleanIntents: string[] = Array.isArray(intents)
      ? intents.filter((i: unknown) => typeof i === 'string' && VALID_INTENTS.has(i))
      : [];

    if (cleanIntents.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one relationship intention.' },
        { status: 400 }
      );
    }

    // Backwards-compatible primary intent column
    const primaryIntent = cleanIntents.includes('long_term')
      ? cleanIntents.length > 1
        ? 'open_to_long'
        : 'long_term'
      : cleanIntents.includes('seeing_where_it_goes')
      ? 'open_to_long'
      : intent === 'long_term' || intent === 'open_to_long' || intent === 'casual'
      ? intent
      : 'casual';

    const cleanSmoking = VALID_SMOKING.has(String(smoking)) ? String(smoking) : 'non_smoker';
    const cleanKids = VALID_KIDS.has(String(wantsKids)) ? String(wantsKids) : 'no_open';
    const cleanPartnerKids = VALID_PARTNER_KIDS.has(String(partnerKidsPref))
      ? String(partnerKidsPref)
      : 'open_to_kids';

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

    const coords =
      SWFL_AREAS[areaLabel] || SWFL_AREAS['Charlotte County (Punta Gorda / Port Charlotte)'];

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
      intent: primaryIntent,
      intents: cleanIntents,
      min_age_pref: Number(minAgePref) || 19,
      max_age_pref: Number(maxAgePref) || 39,
      max_drive_miles: Number(maxDriveMiles) || 45,
      wants_kids: cleanKids,
      partner_kids_pref: cleanPartnerKids,
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

    const res = NextResponse.json({
      userId: authData.user.id,
      displayName: displayName.trim(),
      cohortStatus,
      spotNumber: cohortStatus === 'active' ? currentActive + 1 : null,
      cap: COHORT_CAP_PER_GENDER,
    });

    attachSessionCookie(res, authData.user.id, cleanEmail);
    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: formatError('Unexpected server error', err) },
      { status: 500 }
    );
  }
}