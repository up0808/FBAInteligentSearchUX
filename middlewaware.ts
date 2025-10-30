import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhook(.*)', // If you have webhooks
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const host = req.headers.get('host') || '';
  const pathname = req.nextUrl.pathname;

  // 🧠 API subdomain logic (api.search.fbadevishant.qzz.io)
  if (host.startsWith('api.search.')) {
    // Only allow API routes
    if (!pathname.startsWith('/api')) {
      return NextResponse.json(
        { error: 'Not Found - API routes only', status: 404 },
        { status: 404 }
      );
    }

    // Protect API routes with authentication
    if (!isPublicRoute(req)) {
      await auth.protect();
    }

    return NextResponse.next();
  }

  // 🎨 Frontend subdomain logic (chat.search.fbadevishant.qzz.io)
  else if (host.startsWith('chat.search.')) {
    // Block direct API access from chat subdomain
    if (pathname.startsWith('/api')) {
      return NextResponse.json(
        { error: 'Forbidden - Use api.search subdomain for API calls', status: 403 },
        { status: 403 }
      );
    }

    // Allow public routes
    if (!isPublicRoute(req)) {
      await auth.protect();
    }

    return NextResponse.next();
  }

  // 🌐 Default/localhost logic
  else {
    // For local development or main domain
    if (!isPublicRoute(req) && pathname.startsWith('/api')) {
      await auth.protect();
    }

    return NextResponse.next();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};