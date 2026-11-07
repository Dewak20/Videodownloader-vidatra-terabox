import { NextRequest, NextResponse } from 'next/server';
import { parseMasterM3u8, parseMediaPlaylist } from '@/lib/server/hls-parser';
import { formatBytes } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, referer } = body;

    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required.' }, { status: 400 });
    }

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };
    if (referer) headers['Referer'] = referer;

    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch playlist (HTTP ${res.status})` },
        { status: 422 }
      );
    }

    const manifestText = await res.text();
    if (!manifestText.includes('#EXTM3U')) {
      return NextResponse.json(
        { success: false, error: 'The provided URL is not a valid M3U8 playlist.' },
        { status: 422 }
      );
    }

    // Check if master playlist
    if (manifestText.includes('#EXT-X-STREAM-INF')) {
      const variants = parseMasterM3u8(manifestText, url);
      // Pick highest variant to get segment estimate if available
      if (variants.length > 0) {
        const topVariantUrl = variants[0].url;
        const mediaRes = await fetch(topVariantUrl, { headers, cache: 'no-store' });
        if (mediaRes.ok) {
          const mediaText = await mediaRes.text();
          const parsedMedia = parseMediaPlaylist(mediaText, topVariantUrl);
          
          const estSize = variants[0].bandwidth > 0 && parsedMedia.totalDuration > 0
            ? formatBytes((variants[0].bandwidth / 8) * parsedMedia.totalDuration)
            : undefined;

          return NextResponse.json({
            success: true,
            isMaster: true,
            variants,
            segments: parsedMedia.segments,
            initSegment: parsedMedia.initSegment,
            encrypted: parsedMedia.encrypted,
            duration: parsedMedia.totalDuration,
            resolution: variants[0].resolution,
            sizeLabel: estSize,
          });
        }
      }

      return NextResponse.json({
        success: true,
        isMaster: true,
        variants,
      });
    }

    // Single media playlist
    const parsed = parseMediaPlaylist(manifestText, url);
    return NextResponse.json({
      success: true,
      isMaster: false,
      segments: parsed.segments,
      initSegment: parsed.initSegment,
      encrypted: parsed.encrypted,
      duration: parsed.totalDuration,
    });
  } catch (err: any) {
    console.error('API /resolve-hls error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error resolving playlist.' },
      { status: 500 }
    );
  }
}
