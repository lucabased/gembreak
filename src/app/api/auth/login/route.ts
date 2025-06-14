import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
// import { cookies } from 'next/headers'; // No longer needed for setting cookies here

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-super-secret-jwt-key-at-least-32-chars-long'); // Ensure this is in .env.local and strong

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'development') {
  console.warn(
    'Warning: JWT_SECRET is not set in .env.local. Using a default insecure key for development. Please set a strong secret for production.'
  );
}


export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
      console.error('Critical: ADMIN_USERNAME or ADMIN_PASSWORD is not set in environment variables.');
      return NextResponse.json({ success: false, message: 'Server configuration error.' }, { status: 500 });
    }

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      // Create a JWT
      const expirationTime = '2h'; // Token expires in 2 hours
      const token = await new SignJWT({ username: ADMIN_USERNAME, isAdmin: true })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(expirationTime)
        .sign(JWT_SECRET);

      const response = NextResponse.json({ success: true, message: 'Login successful' });
      // Set the JWT in an HTTP-only cookie
      response.cookies.set('admin_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 2 * 60 * 60, // 2 hours in seconds
        path: '/',
        sameSite: 'lax',
      });

      return response;
    } else {
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ success: false, message: 'An error occurred during login' }, { status: 500 });
  }
}
