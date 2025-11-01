// proxy.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Public routes (no login required)
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-out(.*)',
  '/_next(.*)',      // allow Next internals to pass
  '/api/(.*)',       // allow api public endpoints (if any)
  '/favicon.ico',
  '/robots.txt',
  // (add any other public static routes here)
])

export default clerkMiddleware(async (auth, req) => {
  // If the request does NOT match a public route, protect it.
  // Use await for the async protect() method.
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

// Use a conservative matcher so we don't accidentally process static files.
// This pattern mirrors Clerk / Next examples.
export const config = {
  matcher: [
    // apply middleware to all routes except _next, static files, and api internal assets
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\..*).*)',
  ],
}