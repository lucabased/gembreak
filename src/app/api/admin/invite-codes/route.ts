import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import crypto from 'crypto';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-super-secret-jwt-key-at-least-32-chars-long');

function generateInviteCode(): string {
  return crypto.randomBytes(8).toString('hex'); // Generates a 16-character hex string
}

interface AdminJWTPayload {
  isAdmin?: boolean;
  username?: string; // Admin username from JWT
}

export async function POST(req: NextRequest) {
  // Verify Admin Session (Middleware should already do this, but double check)
  const sessionCookie = req.cookies.get('admin_session');
  if (!sessionCookie) {
    return NextResponse.json({ success: false, message: 'Admin authentication required' }, { status: 401 });
  }
  try {
    const { payload } = await jwtVerify(sessionCookie.value, JWT_SECRET) as { payload: AdminJWTPayload };
    if (!payload.isAdmin) {
      throw new Error('Not an admin user');
    }
  } catch (err) {
    return NextResponse.json({ success: false, message: 'Admin session expired or invalid' }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();
    const inviteCodesCollection = db.collection('invite_codes');
    const usersCollection = db.collection('users'); // To check for collisions with user-generated codes

    let newCode = generateInviteCode();
    // Ensure the generated code is unique across both user invite codes and admin invite codes
    while (
      await usersCollection.findOne({ inviteCode: newCode }) || 
      await inviteCodesCollection.findOne({ code: newCode })
    ) {
      newCode = generateInviteCode();
    }

    const newInviteCodeDocument = {
      code: newCode,
      isUsed: false,
      createdAt: new Date(),
      createdBy: 'admin', // Or payload.username if you want to store which admin created it
      usedBy: null, // To store user ID who uses this code
      usedAt: null,
    };

    const result = await inviteCodesCollection.insertOne(newInviteCodeDocument);
    if (!result.insertedId) {
      throw new Error('Failed to insert new invite code.');
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Invite code generated successfully.', 
      inviteCode: newInviteCodeDocument 
    });

  } catch (error) {
    console.error('Error generating invite code:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ success: false, message: `Failed to generate invite code: ${message}` }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Verify Admin Session
  const sessionCookie = req.cookies.get('admin_session');
  if (!sessionCookie) {
    return NextResponse.json({ success: false, message: 'Admin authentication required' }, { status: 401 });
  }
  try {
    const { payload } = await jwtVerify(sessionCookie.value, JWT_SECRET) as { payload: AdminJWTPayload };
    if (!payload.isAdmin) {
      throw new Error('Not an admin user');
    }
  } catch (err) {
    return NextResponse.json({ success: false, message: 'Admin session expired or invalid' }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();
    const inviteCodesCollection = db.collection('invite_codes');
    
    // Fetch all admin-generated invite codes, sort by creation date
    const codes = await inviteCodesCollection.find({ createdBy: 'admin' }).sort({ createdAt: -1 }).toArray();

    return NextResponse.json({ success: true, inviteCodes: codes });

  } catch (error) {
    console.error('Error fetching invite codes:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ success: false, message: `Failed to fetch invite codes: ${message}` }, { status: 500 });
  }
}
