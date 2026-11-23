import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function getMilesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    const { data: me, error: meError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (meError || !me || me.cohort_status !== 'active') {
      return NextResponse.json({ error: 'User not active in current Drop' }, { status: 403 });
    }

    const { data: myQueueRow } = await supabaseAdmin
      .from('live_queue')
      .upsert({ user_id: me.id, gender: me.gender, status: 'waiting' }, { onConflict: 'user_id' })
      .select()
      .single();

    const waitSeconds = (Date.now() - new Date(myQueueRow.joined_at).getTime()) / 1000;
    const targetGender = me.gender === 'man' ? 'woman' : 'man';
    const currentYear = new Date().getFullYear();
    const myAge = currentYear - me.birth_year;

    const [{ data: blocks }, { data: pastCalls }] = await Promise.all([
      supabaseAdmin
        .from('blocks_and_reports')
        .select('reporter_id, reported_id')
        .or(`reporter_id.eq.${me.id},reported_id.eq.${me.id}`),
      supabaseAdmin
        .from('calls')
        .select('man_id, woman_id')
        .or(`man_id.eq.${me.id},woman_id.eq.${me.id}`),
    ]);

    const excludedIds = new Set<string>([me.id]);
    blocks?.forEach((b) => {
      excludedIds.add(b.reporter_id);
      excludedIds.add(b.reported_id);
    });
    pastCalls?.forEach((c) => {
      excludedIds.add(c.man_id);
      excludedIds.add(c.woman_id);
    });

    const { data: waitingCandidates } = await supabaseAdmin
      .from('live_queue')
      .select('user_id, joined_at, profiles(*)')
      .eq('gender', targetGender)
      .eq('status', 'waiting')
      .order('joined_at', { ascending: true });

    let matchedProfile: any = null;
    let matchedMiles = 0;

    for (const row of waitingCandidates || []) {
      const candidate: any = row.profiles;
      if (!candidate || excludedIds.has(candidate.id)) continue;

      const candAge = currentYear - candidate.birth_year;
      const ageFits =
        candAge >= me.min_age_pref &&
        candAge <= me.max_age_pref &&
        myAge >= candidate.min_age_pref &&
        myAge <= candidate.max_age_pref;

      if (!ageFits) continue;
      if (me.intent !== candidate.intent) continue;

      const miles = getMilesBetween(
        me.approx_lat,
        me.approx_lng,
        candidate.approx_lat,
        candidate.approx_lng
      );

      const mutualMaxMiles = Math.min(me.max_drive_miles, candidate.max_drive_miles);
      const allowedMiles = waitSeconds < 20 ? Math.min(30, mutualMaxMiles) : mutualMaxMiles;

      if (miles <= allowedMiles) {
        matchedProfile = candidate;
        matchedMiles = Math.round(miles);
        break;
      }
    }

    if (!matchedProfile) {
      return NextResponse.json({ status: 'waiting', waitSeconds: Math.floor(waitSeconds) });
    }

    const roomName = `drop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const manId = me.gender === 'man' ? me.id : matchedProfile.id;
    const womanId = me.gender === 'woman' ? me.id : matchedProfile.id;

    await supabaseAdmin
      .from('live_queue')
      .update({ status: 'matched' })
      .in('user_id', [me.id, matchedProfile.id]);

    const { data: call, error: callError } = await supabaseAdmin
      .from('calls')
      .insert({
        livekit_room_name: roomName,
        man_id: manId,
        woman_id: womanId,
        status: 'active',
      })
      .select()
      .single();

    if (callError) throw callError;

    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: me.id,
      name: me.display_name,
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    return NextResponse.json({
      status: 'matched',
      callId: call.id,
      roomName,
      livekitToken: token,
      partnerIntro: {
        displayName: matchedProfile.display_name,
        age: currentYear - matchedProfile.birth_year,
        areaLabel: matchedProfile.area_label,
        approxDriveMinutes: Math.max(10, Math.round(matchedMiles * 1.25)),
        intent: matchedProfile.intent,
        verification: {
          photoMatched: matchedProfile.photo_matched,
          livenessChecked: matchedProfile.liveness_checked,
          ageChecked: matchedProfile.age_checked,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Match error' }, { status: 500 });
  }
}
