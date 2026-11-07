import { StreamExtractResult, QualityOption } from '@/types';
import { parseMasterM3u8 } from '../hls-parser';

export function extractTeraboxKey(url: string): string | null {
  const u = url.trim();

  // 1. Query parameter e.g. ?surl=xyz or &surl=xyz
  const surlMatch = u.match(/[?&]surl=([a-zA-Z0-9_-]+)/i);
  if (surlMatch) {
    const raw = surlMatch[1];
    return raw.startsWith('1') ? raw : '1' + raw;
  }

  // 2. Path matching e.g. /s/1xyz or /s/xyz or /sharing/link/1xyz
  const slashMatch = u.match(/(?:\/s\/|\/sharing\/link\/|\/d\/)([a-zA-Z0-9_-]+)/i);
  if (slashMatch) {
    const raw = slashMatch[1];
    return raw.startsWith('1') ? raw : '1' + raw;
  }

  // 3. Bare key e.g. 1iWp... or iWp...
  if (/^[a-zA-Z0-9_-]{15,40}$/.test(u)) {
    return u.startsWith('1') ? u : '1' + u;
  }

  return null;
}

export function isTeraboxUrl(url: string): boolean {
  const lower = url.toLowerCase();
  const teraboxDomains = [
    'terabox',
    '1024tera',
    'teradl',
    'nephobox',
    '4funbox',
    'mirrobox',
    'momerybox',
    'gibibox',
    'goaibox',
    'terasharelink',
    'teraboxlink',
    'terafileshare',
    'freeterabox',
  ];

  return (
    teraboxDomains.some((d) => lower.includes(d)) ||
    Boolean(extractTeraboxKey(url))
  );
}

export async function extractTerabox(rawUrl: string): Promise<StreamExtractResult> {
  const key = extractTeraboxKey(rawUrl);
  if (!key) {
    return {
      success: false,
      error: 'Invalid TeraBox URL or share key. Please check the link and try again.',
    };
  }

  const normalizedUrl = `https://1024tera.com/s/${key}`;
  const referer = `https://www.terabox.app/sharing/link?surl=${key.replace(/^1/, '')}`;

  // 1. TIER 1: TeraVideo Stream Resolver (Direct HLS Master Playlist + Multi-Quality)
  try {
    const res = await fetch('https://teravideo.in/terabox-api/api.php?action=resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://teravideo.in',
        Referer: 'https://teravideo.in/terabox-player-online/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ url: normalizedUrl }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4500),
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data && data.success && data.data) {
      const activeFile = data.data.active_file || data.data.files?.[0] || {};
      const title = activeFile.name || data.data.title || `TeraBox_${key}`;
      const thumbnail = activeFile.thumbnail || '';
      const duration = activeFile.duration || 0;

      let masterUrl = activeFile.masterUrl || '';
      if (masterUrl && !masterUrl.startsWith('http')) {
        masterUrl = `https://teravideo.in/terabox-api/${masterUrl.replace(/^\/+/, '')}`;
      }

      if (masterUrl) {
        // Try parsing variant resolutions from the master m3u8
        let qualities: QualityOption[] = [];
        try {
          const m3u8Res = await fetch(masterUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Referer: 'https://teravideo.in/',
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
          });

          if (m3u8Res.ok) {
            const manifestText = await m3u8Res.text();
            if (manifestText.includes('#EXT-X-STREAM-INF')) {
              qualities = parseMasterM3u8(manifestText, masterUrl);
            }
          }
        } catch (e: any) {
          console.warn('Could not parse TeraVideo master M3U8:', e?.message);
        }

        if (qualities.length === 0 && Array.isArray(activeFile.qualities)) {
          qualities = activeFile.qualities.map((q: any) => ({
            label: q.label || 'Standard',
            resolution: q.value || 'Auto',
            bandwidth: 0,
            url: masterUrl,
          }));
        }

        if (qualities.length === 0) {
          qualities = [
            {
              label: 'Original Stream',
              resolution: 'Auto',
              bandwidth: 0,
              url: masterUrl,
            },
          ];
        }

        return {
          success: true,
          url: rawUrl,
          site: 'terabox',
          siteName: 'TeraBox HLS Direct',
          title,
          thumbnail,
          filecode: key,
          streamType: 'hls',
          streamingUrl: masterUrl,
          referer: 'https://teravideo.in/',
          embedUrl: normalizedUrl,
          qualities,
          duration,
        };
      }
    } else if (data && data.error) {
      if (data.category === 'expired' || data.upstream_code === 140) {
        return {
          success: false,
          error: 'This TeraBox link has expired or was removed by the owner.',
        };
      }
    }
  } catch (err: any) {
    console.warn('TeraVideo resolver failed, trying Tier 2:', err?.message);
  }

  // 2. TIER 2: TeraBox Pro Fetch API (Direct stream / Fast download link)
  try {
    const fetchUrl = `https://teraboxdownloader.pro/api/fetch-video?url=${encodeURIComponent(
      normalizedUrl
    )}`;
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://teraboxdownloader.pro/',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(4500),
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.status === 'success' && Array.isArray(data.list) && data.list.length > 0) {
        const file = data.list[0];
        const title = file.server_filename || file.file_name || `TeraBox_${key}`;
        const thumbnail = file.thumbnail || file.thumb || '';
        const streamUrl = file.stream_url || file.dlink || file.direct_link || file.downloadUrl || '';

        if (streamUrl) {
          const isHls = streamUrl.includes('.m3u8');
          const qualities: QualityOption[] = [
            {
              label: isHls ? 'Auto HD' : 'Original Video',
              resolution: 'Auto',
              bandwidth: 0,
              url: streamUrl,
            },
          ];

          return {
            success: true,
            url: rawUrl,
            site: 'terabox',
            siteName: 'TeraBox CDN',
            title,
            thumbnail,
            filecode: key,
            streamType: isHls ? 'hls' : 'mp4',
            streamingUrl: streamUrl,
            referer: 'https://teraboxdownloader.pro/',
            embedUrl: normalizedUrl,
            qualities,
          };
        }
      }
    }
  } catch (err: any) {
    console.warn('Tier 2 fetch-video failed, trying Tier 3:', err?.message);
  }

  // 3. TIER 3: TeraBox Official Web SSR Scraping
  try {
    const surlClean = key.replace(/^1/, '');
    const webUrl = `https://www.terabox.app/sharing/link?surl=${surlClean}`;

    const pageRes = await fetch(webUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(4500),
    });

    if (pageRes.ok) {
      const html = await pageRes.text();
      const stateMatch = html.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);

      if (stateMatch) {
        try {
          const state = JSON.parse(stateMatch[1]);
          const share = state.pinia?.share || {};
          const file =
            share.initialFileInfo?.file ||
            share.initialFiles?.[0] ||
            share.shareFiles?.[0] ||
            share.currentFile;

          if (file) {
            const title = file.server_filename || `TeraBox_${key}`;
            const thumbnail = file.thumbs?.url3 || file.thumbs?.url2 || file.thumbs?.url1 || '';
            const streamUrl = file.dlink || file.direct_link || '';

            if (streamUrl) {
              return {
                success: true,
                url: rawUrl,
                site: 'terabox',
                siteName: 'TeraBox Web',
                title,
                thumbnail,
                filecode: key,
                streamType: 'mp4',
                streamingUrl: streamUrl,
                referer: webUrl,
                embedUrl: normalizedUrl,
                qualities: [
                  {
                    label: 'Original Media',
                    resolution: 'Auto',
                    bandwidth: 0,
                    url: streamUrl,
                  },
                ],
              };
            }
          }
        } catch {
          // parse error
        }
      }
    }
  } catch (err: any) {
    console.warn('Tier 3 SSR scraping failed:', err?.message);
  }

  return {
    success: false,
    url: rawUrl,
    site: 'terabox',
    siteName: 'TeraBox',
    filecode: key,
    embedUrl: normalizedUrl,
    error:
      'Failed to resolve TeraBox video stream. The link may have expired, be password-protected, or restricted by TeraBox.',
  };
}
