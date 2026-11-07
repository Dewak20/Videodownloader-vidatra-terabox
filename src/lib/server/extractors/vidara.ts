import { StreamExtractResult, QualityOption } from '@/types';
import { parseMasterM3u8 } from '../hls-parser';
import { nativeRequest } from '../http-client';

export async function extractVidara(url: string): Promise<StreamExtractResult> {
  const codeMatch = url.match(/(?:\/v\/|\/e\/|filecode=|\/d\/)?([a-zA-Z0-9_-]{8,30})/);
  const filecode = codeMatch ? codeMatch[1] : '';

  if (!filecode) {
    return {
      success: false,
      error: 'Invalid Vidara URL or filecode.',
    };
  }

  // 1. DIRECT API APPROACH (Primary & Fast - Signs token directly for caller IP)
  const vidaraDomains = ['vidara.so', 'vidara.to'];

  for (const domain of vidaraDomains) {
    try {
      // Parallel: Fetch embed page for Title + Thumbnail, and call /api/stream
      const embedUrl = `https://${domain}/e/${filecode}`;
      const streamApiUrl = `https://${domain}/api/stream`;

      const [embedRes, streamRes] = await Promise.all([
        fetch(embedUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Referer: `https://${domain}/`,
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        }).catch(() => null),
        fetch(streamApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Referer: embedUrl,
          },
          body: JSON.stringify({
            filecode: filecode,
            device: 'web',
            codecs: ['h265', 'av1'],
          }),
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        }).catch(() => null),
      ]);

      if (streamRes && streamRes.ok) {
        const streamData = await streamRes.json();
        if (streamData && streamData.streaming_url) {
          const streamingUrl = streamData.streaming_url;
          const referer = embedUrl;

          // Extract title from embed page HTML if possible
          let title = '';
          let thumbnail = streamData.thumbnail || '';
          if (embedRes && embedRes.ok) {
            const html = await embedRes.text();
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
              title = titleMatch[1].trim();
            }
          }
          if (!title) {
            title = streamData.title || `Vidara_${filecode}`;
          }

          // Fetch master playlist to parse resolution variants
          let qualities: QualityOption[] = [];
          try {
            const manifestRes = await fetch(streamingUrl, {
              headers: {
                Referer: referer,
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              },
              cache: 'no-store',
              signal: AbortSignal.timeout(15000),
            });
            if (manifestRes.ok) {
              const manifestText = await manifestRes.text();
              if (manifestText.includes('#EXT-X-STREAM-INF')) {
                qualities = parseMasterM3u8(manifestText, streamingUrl);
              }
            }
          } catch (e: any) {
            console.warn('Could not parse direct master m3u8:', e?.message);
          }

          if (qualities.length === 0) {
            qualities = [
              {
                label: 'Original Quality',
                resolution: 'Auto',
                bandwidth: 0,
                url: streamingUrl,
              },
            ];
          }

          return {
            success: true,
            url,
            site: 'vidara',
            siteName: 'Vidara Direct',
            title,
            thumbnail,
            filecode,
            streamType: 'hls',
            streamingUrl,
            referer,
            embedUrl,
            qualities,
          };
        }
      }
    } catch (err: any) {
      console.warn(`Direct Vidara on ${domain} failed, trying next fallback:`, err?.message);
    }
  }

  // 2. FALLBACK: LuLuDownloader API (Secondary)
  try {
    const pageRes = await nativeRequest('https://www.luludownloader.com/vidara-downloader', {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const pageHtml = await pageRes.text();
    const csrfToken = pageHtml.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i)?.[1];
    const setCookieHeader = pageRes.headers['set-cookie'];
    let cookieString = '';
    if (Array.isArray(setCookieHeader)) {
      cookieString = setCookieHeader.map((c) => c.split(';')[0]).join('; ');
    } else if (typeof setCookieHeader === 'string') {
      cookieString = setCookieHeader.split(';')[0];
    }

    if (csrfToken && cookieString) {
      const payload = JSON.stringify({
        action: 'extract',
        url: url,
        tool_slug: 'vidara-downloader',
      });

      const extractRes = await nativeRequest('https://www.luludownloader.com/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': csrfToken,
          Cookie: cookieString,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://www.luludownloader.com/vidara-downloader',
        },
        body: payload,
      });

      if (extractRes.status === 200) {
        const data = await extractRes.json();
        if (data.success && (data.streaming_url || data.proxy_url)) {
          const streamingUrl = data.proxy_url || data.streaming_url;
          const referer = data.referer || data.embed_url || `https://vidara.so/e/${filecode}`;

          let qualities: QualityOption[] = [];
          try {
            const manifestRes = await nativeRequest(streamingUrl, {
              headers: {
                Referer: referer,
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              },
            });
            if (manifestRes.status === 200) {
              const manifestText = await manifestRes.text();
              if (manifestText.includes('#EXT-X-STREAM-INF')) {
                qualities = parseMasterM3u8(manifestText, streamingUrl);
              }
            }
          } catch (e: any) {
            console.warn('Fallback master parse error:', e?.message);
          }

          if (qualities.length === 0) {
            qualities = [
              {
                label: 'Original Quality',
                resolution: 'Auto',
                bandwidth: 0,
                url: streamingUrl,
              },
            ];
          }

          return {
            success: true,
            url,
            site: 'vidara',
            siteName: 'Vidara (Relay)',
            title: data.title || `Vidara_${filecode || 'video'}`,
            thumbnail: data.thumbnail || '',
            filecode: data.filecode || filecode,
            streamType: data.stream_type || 'hls',
            streamingUrl,
            referer,
            embedUrl: data.embed_url || `https://vidara.so/e/${filecode}`,
            qualities,
          };
        }
      }
    }
  } catch (err: any) {
    console.error('All extraction attempts failed:', err?.message || err);
  }

  return {
    success: false,
    url,
    site: 'vidara',
    siteName: 'Vidara',
    filecode,
    embedUrl: `https://vidara.so/e/${filecode}`,
    error: 'Failed to extract video stream. Please ensure the Vidara link is active and accessible.',
  };
}
