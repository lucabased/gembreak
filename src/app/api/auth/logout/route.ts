import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const response = NextResponse.json({ success: true, message: 'Logout successful' });
    // Clear the admin_session cookie
    response.cookies.delete({ name: 'admin_session', path: '/' });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ success: false, message: 'An error occurred during logout' }, { status: 500 });
  }
}
