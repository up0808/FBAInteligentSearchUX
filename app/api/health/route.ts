// app/api/health/route.ts

import { NextResponse } from 'next/server';

const APP_VERSION = '1.0.0';
const DEPLOYMENT_TIME = new Date().toISOString();

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'FBA Dev AI Search Engine',
    version: APP_VERSION,
    deployed_at: DEPLOYMENT_TIME,
    timestamp: new Date().toISOString(),
  });
}