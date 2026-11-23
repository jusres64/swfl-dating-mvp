import { NextRequest, NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { callId, reporterId, severityTier, reasonCode, autoFlagged } = await req.json();
    if (!callId || !reporterId) {
      return NextResponse.json({ error: 'Missing callId or reporterId' }, { status: 400 });
    }

    const { data: call, error: callError } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const reportedId = call.man_id === reporterId ? call.woman_id : call.man_id;

    // 1. Immediately tear down the LiveKit room so both users disconnect
    const livekitHost = process.env.NEXT_PUBLIC_LIVEKIT_URL!.replace('wss://', 'https://');
    const roomService = new RoomServiceClient(
      livekitHost,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );
    try {
      await roomService.deleteRoom(call.livekit_room_name);
    } catch {
      // Room may already be closed
    }

    // 2. Mark call terminated and log permanent block/report
    await Promise.all([
      supabaseAdmin
        .from('calls')
        .update({ status: 'terminated_safety', ended_at: new Date().toISOString() })
        .eq('id', callId),
      supabaseAdmin.from('blocks_and_reports').insert({
        reporter_id: reporterId,
        reported_id: reportedId,
        call_id: callId,
        severity_tier: severityTier || 'tier_1',
        reason_code: reasonCode || 'user_safety_exit',
        auto_flagged: Boolean(autoFlagged),
      }),
    ]);

    return NextResponse.json({ terminated: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Terminate error' }, { status: 500 });
  }
}
