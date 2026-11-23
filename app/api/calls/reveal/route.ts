import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { callId, userId } = await req.json();
    if (!callId || !userId) {
      return NextResponse.json({ error: 'Missing callId or userId' }, { status: 400 });
    }

    const { data: call, error: callError } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('id', callId)
      .eq('status', 'active')
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: 'Active call not found' }, { status: 404 });
    }

    const isMan = call.man_id === userId;
    const isWoman = call.woman_id === userId;
    if (!isMan && !isWoman) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const updateField = isMan ? 'man_reveal_stage' : 'woman_reveal_stage';
    const currentStage = isMan ? call.man_reveal_stage : call.woman_reveal_stage;
    const nextStage = Math.min(2, currentStage + 1);

    const { data: updatedCall, error: updateError } = await supabaseAdmin
      .from('calls')
      .update({ [updateField]: nextStage })
      .eq('id', callId)
      .select('id, active_reveal_stage, man_id, woman_id')
      .single();

    if (updateError) throw updateError;

    let unlockedVault = null;
    if (updatedCall.active_reveal_stage >= 2) {
      const partnerId = isMan ? updatedCall.woman_id : updatedCall.man_id;
      const { data: partner } = await supabaseAdmin
        .from('profiles')
        .select('occupation, height_inches, wants_kids, smoking, bio_prompts, photo_urls')
        .eq('id', partnerId)
        .single();

      unlockedVault = partner;
    }

    return NextResponse.json({
      activeRevealStage: updatedCall.active_reveal_stage,
      unlockedVault,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Reveal error' }, { status: 500 });
  }
}
