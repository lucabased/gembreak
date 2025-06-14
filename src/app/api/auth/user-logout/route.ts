import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const response = NextResponse.json({ success: true, message: 'User logout successful' });
    // Clear the user_session cookie
    response.cookies.delete({ name: 'user_session', path: '/' });
    // For good measure, also try to clear it if it was set with different attributes by mistake
    response.cookies.delete('user_session'); 

    return response;
  } catch (error) {
    console.error('User logout error:', error);
    return NextResponse.json({ success: false, message: 'An error occurred during user logout' }, { status: 500 });
  }
}
