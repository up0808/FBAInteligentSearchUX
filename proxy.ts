import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Define public routes (accessible without login)
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-out(.*)',
])

export default clerkMiddleware((auth, req) => {
  // If route is not public, require authentication
  if (!isPublicRoute(req)) {
    auth().protect()
  }
})

// Apply to all routes except Next.js internals and static assets
export const config = {
  matcher: [
    // Exclude Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|png|gif|svg|ico|ttf|woff2?|mp4|webm|ogg|pdf)).*)',
    // Always apply to API routes
    '/(api|trpc)(.*)',
  ],
    }
