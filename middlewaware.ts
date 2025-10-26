import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';

  // 🧠 API subdomain logic
  if (host.startsWith('api.search.')) {
    const pathname = req.nextUrl.pathname;

    // ✅ Only allow API routes that start with /api
    if (!pathname.startsWith('/api')) {
      return NextResponse.json(
        { error: 'Not Found', status: 404 },
        { status: 404 }
      );
    }
  }

  // Frontend subdomain logic
  else if (host.startsWith('chat.search.')) {
    // Prevent hitting API from frontend domain
    if (req.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json(
        { error: 'Forbidden', status: 403 },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}