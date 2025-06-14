import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { jwtVerify } from 'jose';
import { ObjectId } from 'mongodb';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-super-secret-jwt-key-at-least-32-chars-long');

interface UserJWTPayload {
  userId: string;
  username: string;
  // Add other fields if present in your JWT payload
}

export async function GET(req: NextRequest) {
  try {
    // This route should be protected by middleware, which verifies the JWT
    // and potentially attaches user info to the request.
    // For now, we'll re-verify here if not done by middleware or to be safe.

    const tokenCookie = req.cookies.get('user_session');
    if (!tokenCookie) {
      return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(tokenCookie.value, JWT_SECRET) as { payload: UserJWTPayload };
      if (!payload.userId) {
        throw new Error('User ID not found in token');
      }
      userId = payload.userId;
    } catch (err) {
      console.error('JWT verification error in invite-code route:', err);
      return NextResponse.json({ success: false, message: 'Session invalid or expired.' }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 });
    }

    if (user.isInviteCodeUsed) {
      return NextResponse.json({ success: true, inviteCode: user.inviteCode, message: 'Your invite code has already been used.' });
    }

    return NextResponse.json({ success: true, inviteCode: user.inviteCode, isInviteCodeUsed: user.isInviteCodeUsed });

  } catch (error) {
    console.error('Error fetching invite code:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ success: false, message: `An error occurred: ${message}` }, { status: 500 });
  }
}
