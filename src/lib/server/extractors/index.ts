import { StreamExtractResult } from '@/types';
import { extractVidara } from './vidara';
import { extractTerabox, isTeraboxUrl } from './terabox';
import { parseMasterM3u8 } from '../hls-parser';

export async function extractStream(rawUrl: string): Promise<StreamExtractResult> {
  const url = rawUrl.trim();
  if (!url) {
    return { success: false, error: 'Please enter a valid URL or Video ID.' };
  }

  // Check if it's already a direct .m3u8 or .mp4 link
  if (/\.m3u8(\?|$)/i.test(url)) {
    let qualities = [{ label: 'Direct HLS Stream', resolution: 'Auto', bandwidth: 0, url }];
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('#EXT-X-STREAM-INF')) {
          const parsed = parseMasterM3u8(text, url);
          if (parsed.length > 0) qualities = parsed;
        }
      }
    } catch {
      // ignore
    }

    return {
      success: true,
      url,
      site: 'direct',
      siteName: 'Direct HLS',
      title: 'Direct_HLS_Video',
      streamType: 'hls',
      streamingUrl: url,
      referer: '',
      qualities,
    };
  }

  if (/\.mp4(\?|$)/i.test(url)) {
    return {
      success: true,
      url,
      site: 'direct',
      siteName: 'Direct MP4',
      title: 'Direct_MP4_Video',
      streamType: 'mp4',
      streamingUrl: url,
      referer: '',
      qualities: [{ label: 'Original MP4', resolution: 'Original', bandwidth: 0, url }],
    };
  }

  // Detect TeraBox URLs
  if (isTeraboxUrl(url)) {
    return extractTerabox(url);
  }

  // Detect Vidara / Vidvara
  const lower = url.toLowerCase();
  if (
    lower.includes('vidara') ||
    lower.includes('vidvara') ||
    /^[a-zA-Z0-9_-]{10,25}$/.test(url)
  ) {
    return extractVidara(url);
  }

  // Fallback try Vidara or Terabox
  if (url.includes('1024') || url.includes('/s/')) {
    return extractTerabox(url);
  }

  return extractVidara(url);
}
