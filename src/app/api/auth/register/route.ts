import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import crypto from 'crypto';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-super-secret-jwt-key-at-least-32-chars-long');
const SALT_ROUNDS = 10;

function generateInviteCode(): string {
  return crypto.randomBytes(8).toString('hex'); // Generates a 16-character hex string
}

export async function POST(req: NextRequest) {
  try {
    const { password, username, inviteCodeToUse } = await req.json();

    if (!username || !password || !inviteCodeToUse) {
      return NextResponse.json({ success: false, message: 'Username, password, and invite code are required.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');
    const inviteCodesCollection = db.collection('invite_codes'); // New collection for admin codes

    // 1. Validate the invite code
    let inviteCodeValid = false;
    let codeSource: 'user' | 'admin' | null = null;
    let invitingUserDocument: any = null; // To store the user doc if it's a user-generated code
    let adminInviteCodeDocument: any = null; // To store the admin code doc if it's an admin-generated code

    // Check user-generated invite codes first (old system)
    const userWithInviteCode = await usersCollection.findOne({ inviteCode: inviteCodeToUse, isInviteCodeUsed: { $ne: true } });
    if (userWithInviteCode) {
      inviteCodeValid = true;
      codeSource = 'user';
      invitingUserDocument = userWithInviteCode;
    } else {
      // If not found in user codes, check admin-generated codes
      const adminCode = await inviteCodesCollection.findOne({ code: inviteCodeToUse, isUsed: { $ne: true } });
      if (adminCode) {
        inviteCodeValid = true;
        codeSource = 'admin';
        adminInviteCodeDocument = adminCode;
      }
    }

    if (!inviteCodeValid) {
      return NextResponse.json({ success: false, message: 'Invalid or already used invite code.' }, { status: 400 });
    }

    // 2. Check if username already exists
    const existingUser = await usersCollection.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return NextResponse.json({ success: false, message: 'Username already exists.' }, { status: 409 });
    }

    // 3. Hash the password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // 4. Generate a new unique invite code for the new user
    let newUserInviteCode = generateInviteCode();
    // Ensure the generated code is unique (highly unlikely to collide, but good practice)
    while (await usersCollection.findOne({ inviteCode: newUserInviteCode })) {
      newUserInviteCode = generateInviteCode();
    }

    // 5. Create the new user document
    const newUser = {
      username: username.toLowerCase(), // Store username in lowercase for consistency
      password: hashedPassword,
      // email: email, // Email is now optional, or can be removed if not needed
      inviteCode: newUserInviteCode,
      isInviteCodeUsed: false, // Their own code is not used yet
      usedInviteCode: inviteCodeToUse, // The code they used to sign up
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    if (!result.insertedId) {
      throw new Error('Failed to insert new user.');
    }

    // 6. Mark the used invite code appropriately
    if (codeSource === 'user' && invitingUserDocument) {
      await usersCollection.updateOne(
        { _id: invitingUserDocument._id },
        { $set: { isInviteCodeUsed: true, updatedAt: new Date() } }
      );
    } else if (codeSource === 'admin' && adminInviteCodeDocument) {
      await inviteCodesCollection.updateOne(
        { _id: adminInviteCodeDocument._id },
        { $set: { isUsed: true, usedBy: result.insertedId, usedAt: new Date() } }
      );
    }

    // 7. Create a JWT for the newly registered user
    const expirationTime = '2h'; // Token expires in 2 hours
    const token = await new SignJWT({ userId: result.insertedId, username: newUser.username })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expirationTime)
      .sign(JWT_SECRET);

    const response = NextResponse.json({ success: true, message: 'Registration successful', userId: result.insertedId, username: newUser.username });
    response.cookies.set('user_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 2 * 60 * 60, // 2 hours in seconds
      path: '/',
      sameSite: 'lax',
    });

    return response;

  } catch (error) {
    console.error('Registration error:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ success: false, message: `An error occurred during registration: ${message}` }, { status: 500 });
  }
}
