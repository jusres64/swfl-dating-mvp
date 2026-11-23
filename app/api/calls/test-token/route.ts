import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

export async function POST(req: NextRequest) {
  try {
    const { identity, roomName } = await req.json();
    const userIdentity = identity || `tester_${Math.random().toString(36).slice(2, 6)}`;
    const room = roomName || 'swfl-test-room';

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity: userIdentity, name: userIdentity }
    );
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
    const token = await at.toJwt();

    return NextResponse.json({ token, room, identity: userIdentity });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Token error' }, { status: 500 });
  }
}
