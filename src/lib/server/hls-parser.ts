import { HlsSegment, QualityOption } from '@/types';

export function resolveUrl(base: string, relative: string): string {
  if (!relative) return '';
  try {
    const baseObj = new URL(base);
    const resolved = new URL(relative, base);
    // Preserve query parameters (e.g. ?token=...) if relative has none
    if (!resolved.search && baseObj.search) {
      resolved.search = baseObj.search;
    }
    return resolved.href;
  } catch {
    return relative;
  }
}

export function parseMasterM3u8(manifestText: string, baseUrl: string): QualityOption[] {
  const lines = manifestText.split(/\r?\n/);
  const variants: QualityOption[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/i);
      const resMatch = line.match(/RESOLUTION=([0-9x]+)/i);

      const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
      const resolution = resMatch ? resMatch[1] : '';

      // The next non-empty, non-comment line is the variant URL
      let nextLine = '';
      for (let j = i + 1; j < lines.length; j++) {
        const candidate = lines[j].trim();
        if (candidate && !candidate.startsWith('#')) {
          nextLine = candidate;
          i = j;
          break;
        }
      }

      if (nextLine) {
        const variantUrl = resolveUrl(baseUrl, nextLine);

        let label = 'Auto';
        if (resolution) {
          const height = resolution.split('x')[1];
          if (height) label = `${height}p`;
          else label = resolution;
        } else if (bandwidth > 0) {
          const mbps = (bandwidth / (1024 * 1024)).toFixed(1);
          label = `${mbps} Mbps`;
        }

        variants.push({
          label,
          resolution,
          bandwidth,
          url: variantUrl,
        });
      }
    }
  }

  // Sort highest bandwidth/resolution first
  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return variants;
}

export function parseMediaPlaylist(manifestText: string, baseUrl: string): {
  segments: HlsSegment[];
  initSegment: string | null;
  encrypted: boolean;
  totalDuration: number;
} {
  const lines = manifestText.split(/\r?\n/);
  const segments: HlsSegment[] = [];
  let mediaSequence = 0;
  let currentKey: { method: string; url: string; iv?: string | null } | null = null;
  let initSegmentUrl: string | null = null;
  let pendingDuration = 0;
  let totalDuration = 0;
  let hasEncryption = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = parseInt(line.split(':')[1], 10) || 0;
      continue;
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      const method = (line.match(/METHOD=([^,\s]+)/i) || [])[1] || 'NONE';
      const uri = (line.match(/URI="([^"]+)"/i) || [])[1] || '';
      const iv = (line.match(/IV=(0x[0-9A-Fa-f]+)/i) || [])[1] || null;

      if (method !== 'NONE') {
        hasEncryption = true;
        currentKey = {
          method,
          url: uri ? resolveUrl(baseUrl, uri) : '',
          iv,
        };
      } else {
        currentKey = null;
      }
      continue;
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      const uri = (line.match(/URI="([^"]+)"/i) || [])[1] || '';
      if (uri) {
        initSegmentUrl = resolveUrl(baseUrl, uri);
      }
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const rawDur = line.split(':')[1]?.split(',')[0];
      pendingDuration = parseFloat(rawDur) || 0;
      continue;
    }

    if (!line.startsWith('#')) {
      const segmentUrl = resolveUrl(baseUrl, line);
      segments.push({
        url: segmentUrl,
        duration: pendingDuration,
        sequence: mediaSequence + segments.length,
        key: currentKey ? { ...currentKey } : null,
      });
      totalDuration += pendingDuration;
      pendingDuration = 0;
    }
  }

  return {
    segments,
    initSegment: initSegmentUrl,
    encrypted: hasEncryption,
    totalDuration,
  };
}
