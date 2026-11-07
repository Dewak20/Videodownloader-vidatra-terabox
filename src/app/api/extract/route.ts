import { NextRequest, NextResponse } from 'next/server';
import { extractStream } from '@/lib/server/extractors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'URL parameter is required.' },
        { status: 400 }
      );
    }

    const result = await extractStream(url);

    if (!result.success) {
      return NextResponse.json(result, { status: 422 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('API /extract error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Internal server error while extracting stream.',
      },
      { status: 500 }
    );
  }
}
