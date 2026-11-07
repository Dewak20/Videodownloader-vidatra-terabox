import { NextRequest, NextResponse } from 'next/server';
import { resolveUrl } from '@/lib/server/hls-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rewritePlaylist(manifestText: string, baseUrl: string, referer: string): string {
  const lines = manifestText.split(/\r?\n/);
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    // Rewrite encryption key URI
    if (line.startsWith('#EXT-X-KEY:')) {
      const uriMatch = line.match(/URI="([^"]+)"/i);
      if (uriMatch && uriMatch[1]) {
        const rawUri = uriMatch[1];
        const absKey = resolveUrl(baseUrl, rawUri);
        const proxiedKey = `/api/proxy?url=${encodeURIComponent(absKey)}&ref=${encodeURIComponent(referer)}`;
        line = line.replace(`URI="${rawUri}"`, `URI="${proxiedKey}"`);
      }
      out.push(line);
      continue;
    }

    // Rewrite initialization map URI (fMP4)
    if (line.startsWith('#EXT-X-MAP:')) {
      const mapMatch = line.match(/URI="([^"]+)"/i);
      if (mapMatch && mapMatch[1]) {
        const rawMap = mapMatch[1];
        const absMap = resolveUrl(baseUrl, rawMap);
        const proxiedMap = `/api/proxy?url=${encodeURIComponent(absMap)}&ref=${encodeURIComponent(referer)}`;
        line = line.replace(`URI="${rawMap}"`, `URI="${proxiedMap}"`);
      }
      out.push(line);
      continue;
    }

    // Rewrite variant stream URL or media segment URL
    if (!line.startsWith('#')) {
      let candidate = line;
      // If candidate was already proxied by an external proxy (like LuLu), extract raw target if present
      if (candidate.includes('/proxy?url=')) {
        try {
          const u = new URL(candidate);
          const inner = u.searchParams.get('url');
          if (inner) candidate = inner;
        } catch (_) {}
      }

      const absUrl = resolveUrl(baseUrl, candidate);
      const proxiedUrl = `/api/proxy?url=${encodeURIComponent(absUrl)}&ref=${encodeURIComponent(referer)}`;
      out.push(proxiedUrl);
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url');
  const referer = req.nextUrl.searchParams.get('ref') || '';

  if (!targetUrl) {
    return new NextResponse('URL parameter is required', { status: 400 });
  }

  try {
    const upstreamHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: '*/*',
    };

    if (referer) {
      upstreamHeaders['Referer'] = referer;
    }

    // Forward client Range header if present (for seeking in video segments)
    const rangeHeader = req.headers.get('range');
    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader;
    }

    const upstreamRes = await fetch(targetUrl, {
      method: 'GET',
      headers: upstreamHeaders,
      cache: 'no-store',
    });

    const contentType = upstreamRes.headers.get('content-type') || '';
    const isM3u8 =
      targetUrl.includes('.m3u8') ||
      contentType.includes('application/vnd.apple.mpegurl') ||
      contentType.includes('application/x-mpegurl') ||
      contentType.includes('audio/x-mpegurl');

    // If it's a playlist, rewrite segment & variant URLs so browser loads everything via /api/proxy
    if (isM3u8) {
      const rawText = await upstreamRes.text();
      if (rawText.includes('#EXTM3U')) {
        const rewritten = rewritePlaylist(rawText, targetUrl, referer);
        return new NextResponse(rewritten, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      }
    }

    // For media segments (.ts / fmp4 / mp4): stream directly
    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    if (contentType) responseHeaders.set('Content-Type', contentType);
    const contentLength = upstreamRes.headers.get('content-length');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);
    const contentRange = upstreamRes.headers.get('content-range');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);
    const acceptRanges = upstreamRes.headers.get('accept-ranges');
    if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error('Proxy stream error:', err);
    return new NextResponse(`Proxy error: ${err?.message || 'Failed to fetch upstream'}`, {
      status: 502,
    });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
    },
  });
}
