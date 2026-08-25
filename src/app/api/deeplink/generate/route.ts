import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json({ 
    success: false, 
    error: 'Deeplink service temporarily unavailable. Please use the web app directly.' 
  }, { status: 503 });
}

export async function GET() {
  return NextResponse.json({ 
    success: false, 
    error: 'Deeplink service temporarily unavailable.' 
  }, { status: 503 });
}
