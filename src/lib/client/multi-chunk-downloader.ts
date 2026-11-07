import { HlsSegment, DownloadProgress } from '@/types';
import { decryptAes128Segment } from './crypto-utils';
import { transmuxTsToMp4 } from './transmuxer';

export interface DownloaderOptions {
  segments: HlsSegment[];
  initSegmentUrl?: string | null;
  referer?: string;
  concurrency?: number;
  format?: 'mp4' | 'ts';
  onProgress: (progress: DownloadProgress) => void;
  shouldPause?: () => boolean;
  abortSignal?: AbortSignal;
}

export class MultiChunkDownloader {
  private segments: HlsSegment[];
  private initSegmentUrl?: string | null;
  private referer: string;
  private concurrency: number;
  private format: 'mp4' | 'ts';
  private onProgress: (progress: DownloadProgress) => void;
  private shouldPause?: () => boolean;
  private abortSignal?: AbortSignal;

  // State
  private downloadedChunks: Map<number, Uint8Array> = new Map();
  private totalBytesDownloaded = 0;
  private speedSamples: { time: number; bytes: number }[] = [];
  private isRunning = false;

  constructor(options: DownloaderOptions) {
    this.segments = options.segments;
    this.initSegmentUrl = options.initSegmentUrl;
    this.referer = options.referer || '';
    this.concurrency = Math.max(1, Math.min(16, options.concurrency || 6));
    this.format = options.format || 'mp4';
    this.onProgress = options.onProgress;
    this.shouldPause = options.shouldPause;
    this.abortSignal = options.abortSignal;
  }

  private getProxyUrl(targetUrl: string): string {
    return `/api/proxy?url=${encodeURIComponent(targetUrl)}&ref=${encodeURIComponent(this.referer)}`;
  }

  private async fetchChunkWithRetry(url: string, maxRetries = 3): Promise<Uint8Array> {
    let attempts = 0;
    while (attempts < maxRetries) {
      if (this.abortSignal?.aborted) {
        throw new Error('Download aborted by user');
      }

      try {
        const proxyUrl = this.getProxyUrl(url);
        const res = await fetch(proxyUrl, {
          method: 'GET',
          signal: this.abortSignal,
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const buffer = await res.arrayBuffer();
        return new Uint8Array(buffer);
      } catch (err: any) {
        attempts++;
        if (this.abortSignal?.aborted || attempts >= maxRetries) {
          throw err;
        }
        // Small backoff before retry
        await new Promise((r) => setTimeout(r, 600 * attempts));
      }
    }
    throw new Error('Failed to fetch segment after max retries');
  }

  private updateMetrics() {
    const now = Date.now();
    // Record sample
    this.speedSamples.push({ time: now, bytes: this.totalBytesDownloaded });
    // Keep last 3 seconds
    this.speedSamples = this.speedSamples.filter((s) => now - s.time <= 3000);

    let speedBps = 0;
    if (this.speedSamples.length >= 2) {
      const oldest = this.speedSamples[0];
      const newest = this.speedSamples[this.speedSamples.length - 1];
      const timeDiffSec = (newest.time - oldest.time) / 1000;
      const bytesDiff = newest.bytes - oldest.bytes;
      if (timeDiffSec > 0.2) {
        speedBps = Math.max(0, bytesDiff / timeDiffSec);
      }
    }

    const totalSegs = this.segments.length;
    const completedSegs = this.downloadedChunks.size;
    const percent = Math.min(100, Math.round((completedSegs / totalSegs) * 90)); // 90% for download, 10% for transmux

    // Calculate ETA
    const remainingSegs = totalSegs - completedSegs;
    const avgSegBytes = completedSegs > 0 ? this.totalBytesDownloaded / completedSegs : 1024 * 512;
    const remainingBytes = remainingSegs * avgSegBytes;
    const etaSeconds = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;

    this.onProgress({
      status: 'downloading',
      percent,
      completedSegments: completedSegs,
      totalSegments: totalSegs,
      speedBps,
      etaSeconds,
      message: `Downloading chunk ${completedSegs} of ${totalSegs}`,
    });
  }

  public async start(): Promise<Uint8Array> {
    this.isRunning = true;
    const totalSegs = this.segments.length;

    if (totalSegs === 0) {
      throw new Error('Playlist has no segments to download');
    }

    // 1. Fetch init segment if present (for fMP4)
    let initSegmentBytes: Uint8Array | null = null;
    if (this.initSegmentUrl) {
      this.onProgress({
        status: 'downloading',
        percent: 1,
        completedSegments: 0,
        totalSegments: totalSegs,
        speedBps: 0,
        etaSeconds: 0,
        message: 'Fetching initialization segment...',
      });
      initSegmentBytes = await this.fetchChunkWithRetry(this.initSegmentUrl);
      this.totalBytesDownloaded += initSegmentBytes.byteLength;
    }

    // 2. Worker Queue
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < totalSegs) {
        if (this.abortSignal?.aborted) {
          throw new Error('Download cancelled');
        }

        if (this.shouldPause && this.shouldPause()) {
          // Worker pauses
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }

        const currentIndex = nextIndex++;
        if (this.downloadedChunks.has(currentIndex)) {
          continue; // Already downloaded
        }

        const seg = this.segments[currentIndex];
        let chunkData = await this.fetchChunkWithRetry(seg.url);

        // Decrypt if segment is encrypted (AES-128)
        if (seg.key && seg.key.method === 'AES-128') {
          chunkData = await decryptAes128Segment(
            chunkData,
            seg.key.url,
            seg.key.iv,
            seg.sequence,
            (url) => this.getProxyUrl(url)
          );
        }

        this.downloadedChunks.set(currentIndex, chunkData);
        this.totalBytesDownloaded += chunkData.byteLength;
        this.updateMetrics();
      }
    };

    // Run concurrency workers
    const workers = Array.from({ length: this.concurrency }, () => worker());
    await Promise.all(workers);

    // 3. Assemble and Transmux
    this.onProgress({
      status: 'transmuxing',
      percent: 92,
      completedSegments: totalSegs,
      totalSegments: totalSegs,
      speedBps: 0,
      etaSeconds: 0,
      message: 'Processing and merging video segments...',
    });

    const orderedChunks: Uint8Array[] = [];
    if (initSegmentBytes) {
      orderedChunks.push(initSegmentBytes);
    }
    for (let i = 0; i < totalSegs; i++) {
      const c = this.downloadedChunks.get(i);
      if (c) orderedChunks.push(c);
    }

    // If user requested raw TS or already fMP4
    if (this.format === 'ts' || initSegmentBytes) {
      let totalSize = 0;
      for (const chunk of orderedChunks) totalSize += chunk.byteLength;
      const combined = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of orderedChunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }

      this.onProgress({
        status: 'completed',
        percent: 100,
        completedSegments: totalSegs,
        totalSegments: totalSegs,
        speedBps: 0,
        etaSeconds: 0,
        message: 'Download complete!',
      });
      return combined;
    }

    // Transmux TS to MP4
    const mp4Bytes = await transmuxTsToMp4(orderedChunks);

    this.onProgress({
      status: 'completed',
      percent: 100,
      completedSegments: totalSegs,
      totalSegments: totalSegs,
      speedBps: 0,
      etaSeconds: 0,
      message: 'Conversion completed successfully!',
    });

    return mp4Bytes;
  }
}
