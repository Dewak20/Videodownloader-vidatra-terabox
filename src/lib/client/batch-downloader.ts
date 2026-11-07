import { StreamExtractResult, DownloadProgress } from '@/types';
import { MultiChunkDownloader } from './multi-chunk-downloader';
import { saveBlob } from './transmuxer';
import { safeFilename, formatBytes } from '@/lib/utils';

export interface DownloadSingleVideoOptions {
  url: string;
  format?: 'mp4' | 'ts';
  concurrency?: number;
  abortSignal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
  shouldPause?: () => boolean;
}

export interface DownloadVideoResult {
  title: string;
  filename: string;
  sizeBytes: number;
  format: 'mp4' | 'ts';
  siteName: string;
}

/**
 * Downloads a video from a URL (Vidara, TeraBox, raw M3U8, or direct MP4)
 * and saves it to the browser's download folder.
 */
export async function downloadSingleVideo(
  options: DownloadSingleVideoOptions
): Promise<DownloadVideoResult> {
  const {
    url,
    format = 'mp4',
    concurrency = 6,
    abortSignal,
    onProgress,
    shouldPause,
  } = options;

  // 1. Extract stream metadata
  onProgress?.({
    status: 'extracting',
    percent: 2,
    completedSegments: 0,
    totalSegments: 0,
    speedBps: 0,
    etaSeconds: 0,
    message: 'Extracting video link...',
  });

  const extractRes = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal: abortSignal,
  });

  if (!extractRes.ok) {
    const err = await extractRes.json().catch(() => ({}));
    throw new Error(err.error || `Failed to extract stream (HTTP ${extractRes.status})`);
  }

  const data: StreamExtractResult = await extractRes.json();
  if (!data.success) {
    throw new Error(data.error || 'Video stream extraction failed');
  }

  const targetUrl = data.qualities?.[0]?.url || data.streamingUrl;
  if (!targetUrl) {
    throw new Error('No playable stream URL found for this video');
  }

  const videoTitle = data.title || 'video';
  const siteName = data.siteName || data.site || 'VidFlow';

  // 2. Direct MP4 Download Handler
  if (data.streamType === 'mp4' || /\.mp4(\?|$)/i.test(targetUrl)) {
    onProgress?.({
      status: 'downloading',
      percent: 5,
      completedSegments: 1,
      totalSegments: 1,
      speedBps: 0,
      etaSeconds: 0,
      message: 'Downloading direct MP4 file...',
    });

    const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}&ref=${encodeURIComponent(
      data.referer || ''
    )}`;

    const res = await fetch(proxyUrl, { signal: abortSignal });
    if (!res.ok) throw new Error(`Download failed with HTTP ${res.status}`);

    const total = Number(res.headers.get('content-length') || 0);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported by browser');

    const chunks: Uint8Array[] = [];
    let received = 0;
    let lastTime = Date.now();
    let lastReceived = 0;
    let speed = 0;

    while (true) {
      if (abortSignal?.aborted) throw new Error('Download cancelled');

      if (shouldPause && shouldPause()) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }

      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      received += value.byteLength;

      const now = Date.now();
      if (now - lastTime >= 400) {
        speed = ((received - lastReceived) / (now - lastTime)) * 1000;
        lastTime = now;
        lastReceived = received;

        const pct = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 50;
        const eta = total > 0 && speed > 0 ? Math.ceil((total - received) / speed) : 0;

        onProgress?.({
          status: 'downloading',
          percent: pct,
          completedSegments: 1,
          totalSegments: 1,
          speedBps: speed,
          etaSeconds: eta,
          message: `Downloading: ${formatBytes(received)}${total > 0 ? ` / ${formatBytes(total)}` : ''}`,
        });
      }
    }

    const buf = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.byteLength;
    }

    const filename = safeFilename(videoTitle, data.filecode) + '.mp4';
    saveBlob(buf, filename, 'video/mp4');

    onProgress?.({
      status: 'completed',
      percent: 100,
      completedSegments: 1,
      totalSegments: 1,
      speedBps: 0,
      etaSeconds: 0,
      message: 'Download complete!',
    });

    return {
      title: videoTitle,
      filename,
      sizeBytes: received,
      format: 'mp4',
      siteName,
    };
  }

  // 3. HLS Multi-Threaded Download Handler
  onProgress?.({
    status: 'fetching-manifest',
    percent: 8,
    completedSegments: 0,
    totalSegments: 0,
    speedBps: 0,
    etaSeconds: 0,
    message: 'Resolving HLS playlist and segments...',
  });

  const resolveRes = await fetch('/api/resolve-hls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: targetUrl,
      referer: data.referer || data.embedUrl,
    }),
    signal: abortSignal,
  });

  if (!resolveRes.ok) {
    throw new Error('Failed to resolve HLS playlist segments');
  }

  const resolved = await resolveRes.json();
  if (!resolved.success || !resolved.segments || resolved.segments.length === 0) {
    throw new Error(resolved.error || 'No playable video segments found in stream');
  }

  const downloader = new MultiChunkDownloader({
    segments: resolved.segments,
    initSegmentUrl: resolved.initSegment,
    referer: data.referer || data.embedUrl,
    concurrency,
    format,
    shouldPause,
    abortSignal,
    onProgress: (prog) => {
      onProgress?.(prog);
    },
  });

  const videoBytes = await downloader.start();
  const ext = format === 'ts' ? '.ts' : '.mp4';
  const mimeType = format === 'ts' ? 'video/mp2t' : 'video/mp4';
  const filename = safeFilename(videoTitle, data.filecode) + ext;

  saveBlob(videoBytes, filename, mimeType);

  onProgress?.({
    status: 'completed',
    percent: 100,
    completedSegments: resolved.segments.length,
    totalSegments: resolved.segments.length,
    speedBps: 0,
    etaSeconds: 0,
    message: 'Download complete!',
  });

  return {
    title: videoTitle,
    filename,
    sizeBytes: videoBytes.byteLength,
    format,
    siteName,
  };
}
