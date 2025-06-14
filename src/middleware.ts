import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-super-secret-jwt-key-at-least-32-chars-long');

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'development') {
  console.warn(
    'Warning: JWT_SECRET is not set in .env.local for middleware. Using a default insecure key. Please set a strong secret for production.'
  );
}

interface JWTPayload {
  isAdmin?: boolean;
  userId?: string;
  email?: string; // Changed from username to email
  // other claims
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths that do not require any authentication
  const publicPaths = [
    '/admin/login', // Admin login page
    '/api/auth/login', // Admin login API
    '/api/auth/register', // User registration API
    '/api/auth/user-login', // User login API
    // Add other public pages like '/', '/about', etc. if needed
  ];

  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // Define admin paths that require admin authentication
  const adminPaths = ['/admin', '/api/admin']; // Excludes /admin/login
  const isAdminPath = adminPaths.some(adminPath => pathname.startsWith(adminPath) && pathname !== '/admin/login');

  // Define user-specific API paths that require user authentication
  const userApiPaths = ['/api/user'];
  const isUserApiPath = userApiPaths.some(userApiPath => pathname.startsWith(userApiPath));

  // Handle Admin Paths
  if (isAdminPath) {
    const sessionCookie = req.cookies.get('admin_session');
    if (!sessionCookie) {
      const response = pathname.startsWith('/api/admin')
        ? NextResponse.json({ success: false, message: 'Admin authentication required' }, { status: 401 })
        : NextResponse.redirect(new URL('/admin/login', req.url));
      return response;
    }
    try {
      const { payload } = await jwtVerify(sessionCookie.value, JWT_SECRET) as { payload: JWTPayload };
      if (!payload.isAdmin) {
        throw new Error('Not an admin user');
      }
      // Optionally attach admin payload to request
      // const newReq = new NextRequest(req.nextUrl, req);
      // newReq.headers.set('x-admin-payload', JSON.stringify(payload));
      return NextResponse.next(); // Or return newReq if attaching payload
    } catch (err) {
      console.error('Admin JWT verification error:', err);
      const response = pathname.startsWith('/api/admin')
        ? NextResponse.json({ success: false, message: 'Admin session expired or invalid' }, { status: 401 })
        : NextResponse.redirect(new URL('/admin/login', req.url));
      response.cookies.delete({ name: 'admin_session', path: '/' });
      return response;
    }
  }

  // Handle User API Paths
  if (isUserApiPath) {
    const sessionCookie = req.cookies.get('user_session');
    if (!sessionCookie) {
      return NextResponse.json({ success: false, message: 'User authentication required' }, { status: 401 });
    }
    try {
      const { payload } = await jwtVerify(sessionCookie.value, JWT_SECRET) as { payload: JWTPayload };
      if (!payload.userId) { // Check for a claim specific to user JWTs
        throw new Error('Not a valid user session');
      }
      // Optionally attach user payload to request
      // const newReq = new NextRequest(req.nextUrl, req);
      // newReq.headers.set('x-user-payload', JSON.stringify(payload));
      return NextResponse.next(); // Or return newReq if attaching payload
    } catch (err) {
      console.error('User JWT verification error:', err);
      const response = NextResponse.json({ success: false, message: 'User session expired or invalid' }, { status: 401 });
      response.cookies.delete({ name: 'user_session', path: '/' });
      return response;
    }
  }

  // For any other paths not explicitly handled, proceed (or define default behavior)
  // This might include public frontend pages if not listed in publicPaths
  return NextResponse.next();
}

// Configure the middleware to run on specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     *
     * And explicitly EXCLUDE public API auth routes from the default blocking behavior,
     * as their public/private status is handled within the middleware logic itself.
     * The goal is to make the middleware run on most paths, and then the logic inside
     * decides what to do.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/auth/login|api/auth/register|api/auth/user-login|$).*)',
    // Explicitly include paths that need processing by the middleware
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/user/:path*',
  ],
};
