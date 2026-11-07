'use client';

import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Download,
  Sliders,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Film,
  Zap,
  Clock,
  HardDrive,
  Eye,
  XCircle,
} from 'lucide-react';
import { StreamExtractResult, QualityOption, DownloadProgress, DownloadStatus } from '@/types';
import { MultiChunkDownloader } from '@/lib/client/multi-chunk-downloader';
import { saveBlob } from '@/lib/client/transmuxer';
import { formatBytes, formatSpeed, safeFilename } from '@/lib/utils';

interface VideoPreviewCardProps {
  data: StreamExtractResult;
  onDownloadFinished?: (item: {
    title: string;
    site: string;
    quality: string;
    sizeBytes: number;
  }) => void;
}

export const VideoPreviewCard: React.FC<VideoPreviewCardProps> = ({
  data,
  onDownloadFinished,
}) => {
  const [selectedQuality, setSelectedQuality] = useState<QualityOption | null>(
    data.qualities && data.qualities.length > 0 ? data.qualities[0] : null
  );
  const [format, setFormat] = useState<'mp4' | 'ts'>('mp4');
  const [concurrency, setConcurrency] = useState<number>(6);
  const [showPlayer, setShowPlayer] = useState<boolean>(false);

  // Download state
  const [progress, setProgress] = useState<DownloadProgress>({
    status: 'idle',
    percent: 0,
    completedSegments: 0,
    totalSegments: 0,
    speedBps: 0,
    etaSeconds: 0,
  });

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const pauseRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Player ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Initialize selected quality if data changes
  useEffect(() => {
    if (data.qualities && data.qualities.length > 0) {
      setSelectedQuality(data.qualities[0]);
    }
  }, [data]);

  // Hls.js setup for preview player
  useEffect(() => {
    if (!showPlayer || !videoRef.current) return;

    const streamUrl = selectedQuality?.url || data.streamingUrl;
    if (!streamUrl) return;

    const proxiedUrl = `/api/proxy?url=${encodeURIComponent(streamUrl)}&ref=${encodeURIComponent(
      data.referer || ''
    )}`;

    if (data.streamType === 'mp4' || /\.mp4(\?|$)/i.test(streamUrl)) {
      videoRef.current.src = proxiedUrl;
      videoRef.current.play().catch(() => {});
      return;
    }

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: true,
        // Tolerate flaky connections in the preview player too
        manifestLoadingTimeOut: 15000,
        manifestLoadingMaxRetry: 4,
        levelLoadingTimeOut: 15000,
        levelLoadingMaxRetry: 4,
        fragLoadingTimeOut: 40000,
        fragLoadingMaxRetry: 8,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });

      hls.loadSource(proxiedUrl);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current?.play().catch(() => {});
      });

      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = proxiedUrl;
    }
  }, [showPlayer, selectedQuality, data]);

  // Handle Pause / Resume
  const togglePause = () => {
    const nextState = !isPaused;
    setIsPaused(nextState);
    pauseRef.current = nextState;
  };

  // Handle Cancel
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsPaused(false);
    pauseRef.current = false;
    setProgress({
      status: 'cancelled',
      percent: 0,
      completedSegments: 0,
      totalSegments: 0,
      speedBps: 0,
      etaSeconds: 0,
      message: 'Download cancelled',
    });
  };

  // Start Download
  const startDownload = async () => {
    const targetUrl = selectedQuality?.url || data.streamingUrl;
    if (!targetUrl) return;

    abortControllerRef.current = new AbortController();
    setIsPaused(false);
    pauseRef.current = false;

    setProgress({
      status: 'fetching-manifest',
      percent: 2,
      completedSegments: 0,
      totalSegments: 0,
      speedBps: 0,
      etaSeconds: 0,
      message: 'Fetching stream segments manifest...',
    });

    try {
      // Direct MP4 download handler
      if (data.streamType === 'mp4' || /\.mp4(\?|$)/i.test(targetUrl)) {
        setProgress({
          status: 'downloading',
          percent: 10,
          completedSegments: 1,
          totalSegments: 1,
          speedBps: 0,
          etaSeconds: 0,
          message: 'Downloading direct MP4 file...',
        });

        const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}&ref=${encodeURIComponent(
          data.referer || ''
        )}`;
        const res = await fetch(proxyUrl, {
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const total = Number(res.headers.get('content-length') || 0);
        const reader = res.body?.getReader();
        if (!reader) throw new Error('Readable stream not supported');

        const chunks: Uint8Array[] = [];
        let received = 0;
        let lastTime = Date.now();
        let lastReceived = 0;
        let speed = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;

          const now = Date.now();
          if (now - lastTime >= 500) {
            speed = ((received - lastReceived) / (now - lastTime)) * 1000;
            lastTime = now;
            lastReceived = received;

            const pct = total > 0 ? Math.round((received / total) * 100) : 50;
            const eta = total > 0 && speed > 0 ? Math.ceil((total - received) / speed) : 0;
            setProgress({
              status: 'downloading',
              percent: pct,
              completedSegments: 1,
              totalSegments: 1,
              speedBps: speed,
              etaSeconds: eta,
              message: `Downloaded ${formatBytes(received)} / ${formatBytes(total)}`,
            });
          }
        }

        const buf = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) {
          buf.set(c, offset);
          offset += c.byteLength;
        }

        const filename = safeFilename(data.title, data.filecode) + '.mp4';
        saveBlob(buf, filename, 'video/mp4');

        setProgress({
          status: 'completed',
          percent: 100,
          completedSegments: 1,
          totalSegments: 1,
          speedBps: 0,
          etaSeconds: 0,
          message: 'Download complete!',
        });

        onDownloadFinished?.({
          title: data.title || filename,
          site: data.siteName || 'Direct',
          quality: selectedQuality?.label || 'Original',
          sizeBytes: received,
        });
        return;
      }

      // HLS Multi-Threaded Download
      const resolveRes = await fetch('/api/resolve-hls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          referer: data.referer || data.embedUrl,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!resolveRes.ok) {
        throw new Error('Could not resolve HLS segments from playlist.');
      }

      const resolved = await resolveRes.json();
      if (!resolved.success || !resolved.segments || resolved.segments.length === 0) {
        throw new Error(resolved.error || 'No playable video segments found.');
      }

      const downloader = new MultiChunkDownloader({
        segments: resolved.segments,
        initSegmentUrl: resolved.initSegment,
        referer: data.referer || data.embedUrl,
        concurrency: concurrency,
        format: format,
        shouldPause: () => pauseRef.current,
        abortSignal: abortControllerRef.current.signal,
        onProgress: (prog) => {
          setProgress(prog);
        },
      });

      const videoBytes = await downloader.start();
      const ext = format === 'ts' ? '.ts' : '.mp4';
      const mime = format === 'ts' ? 'video/mp2t' : 'video/mp4';
      const filename = safeFilename(data.title, data.filecode) + ext;

      saveBlob(videoBytes, filename, mime);

      onDownloadFinished?.({
        title: data.title || filename,
        site: data.siteName || 'Vidara',
        quality: selectedQuality?.label || 'Auto',
        sizeBytes: videoBytes.byteLength,
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('cancelled')) {
        return;
      }
      console.error('Download error:', err);
      setProgress({
        status: 'error',
        percent: 0,
        completedSegments: 0,
        totalSegments: 0,
        speedBps: 0,
        etaSeconds: 0,
        error: err?.message || 'Download failed. Please try again.',
      });
    }
  };

  const isDownloading = progress.status === 'downloading' || progress.status === 'fetching-manifest' || progress.status === 'transmuxing';

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 bg-surface border border-surfaceLight/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
      {/* Top Banner Details */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Thumbnail / Player Box */}
        <div className="w-full md:w-80 flex-shrink-0">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/60 border border-surfaceLight group shadow-lg">
            {showPlayer ? (
              <video
                ref={videoRef}
                controls
                playsInline
                className="w-full h-full object-contain"
              />
            ) : (
              <>
                {data.thumbnail ? (
                  <img
                    src={data.thumbnail}
                    alt={data.title || 'Video Thumbnail'}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-surfaceLight/30 text-gray-500">
                    <Film className="w-12 h-12 text-gray-600" />
                  </div>
                )}
                <button
                  onClick={() => setShowPlayer(true)}
                  className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white flex items-center justify-center backdrop-blur-sm transition-all transform hover:scale-110 shadow-xl shadow-blue-900/50"
                  title="Watch Preview"
                >
                  <Play className="w-6 h-6 ml-1 fill-white" />
                </button>
              </>
            )}

            {/* Source Tag */}
            <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-blue-400">
              {data.siteName || 'Vidara'}
            </div>
          </div>

          {showPlayer && (
            <button
              onClick={() => setShowPlayer(false)}
              className="mt-2 text-xs text-gray-400 hover:text-white flex items-center gap-1 mx-auto"
            >
              <Eye className="w-3.5 h-3.5" /> Close Player Preview
            </button>
          )}
        </div>

        {/* Video Info & Controls */}
        <div className="flex-1 w-full flex flex-col justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 leading-snug line-clamp-2">
              {data.title || `Video_${data.filecode || 'Stream'}`}
            </h2>

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-6">
              <span className="px-2.5 py-1 rounded-md bg-surfaceLight/50 text-gray-300 font-mono">
                ID: {data.filecode || 'N/A'}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-surfaceLight/50 text-emerald-400 font-medium">
                {data.streamType?.toUpperCase() || 'HLS STREAM'}
              </span>
              <span className="text-gray-500">•</span>
              <span>Fast Multi-Chunk Enabled</span>
            </div>

            {/* Quality & Format Settings Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 p-4 rounded-2xl bg-surfaceLight/30 border border-surfaceLight/50">
              {/* Quality Picker */}
              <div>
                <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Film className="w-3 h-3 text-blue-400" /> Resolution
                </label>
                <select
                  value={selectedQuality?.url || ''}
                  onChange={(e) => {
                    const q = data.qualities?.find((item) => item.url === e.target.value);
                    if (q) setSelectedQuality(q);
                  }}
                  disabled={isDownloading}
                  className="w-full bg-surface border border-surfaceLight text-white text-xs font-medium rounded-xl px-3 py-2 outline-none focus:border-blue-500 cursor-pointer disabled:opacity-60"
                >
                  {data.qualities && data.qualities.length > 0 ? (
                    data.qualities.map((q, idx) => (
                      <option key={idx} value={q.url}>
                        {q.label} {q.resolution ? `(${q.resolution})` : ''}
                      </option>
                    ))
                  ) : (
                    <option value={data.streamingUrl}>Original Quality</option>
                  )}
                </select>
              </div>

              {/* Format Picker */}
              <div>
                <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-violet-400" /> Output Format
                </label>
                <div className="flex items-center rounded-xl bg-surface p-1 border border-surfaceLight">
                  <button
                    type="button"
                    onClick={() => setFormat('mp4')}
                    disabled={isDownloading}
                    className={`flex-1 py-1 px-2 text-xs font-semibold rounded-lg transition-all ${
                      format === 'mp4'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    MP4
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat('ts')}
                    disabled={isDownloading}
                    className={`flex-1 py-1 px-2 text-xs font-semibold rounded-lg transition-all ${
                      format === 'ts'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    TS Raw
                  </button>
                </div>
              </div>

              {/* Threads / Concurrency */}
              <div>
                <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" /> Threads ({concurrency}x)
                </label>
                <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-surfaceLight">
                  {[2, 4, 6, 8].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setConcurrency(t)}
                      disabled={isDownloading}
                      className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-all ${
                        concurrency === t
                          ? 'bg-indigo-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {t}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action Button & Telemetry */}
          <div>
            {!isDownloading && progress.status !== 'completed' && (
              <button
                onClick={startDownload}
                className="w-full py-4 px-6 rounded-2xl font-bold text-base text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 shadow-xl shadow-blue-600/25 transition-all flex items-center justify-center gap-2 group active:scale-[0.99]"
              >
                <Download className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                <span>Start Ultra-Fast Download ({format.toUpperCase()})</span>
              </button>
            )}

            {/* Live Progress Bar & Telemetry */}
            {isDownloading && (
              <div className="p-4 rounded-2xl bg-surfaceLight/40 border border-blue-500/20 shadow-inner">
                {/* Status & Stats Top */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs font-medium text-gray-300 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                    <span className="text-white font-bold">{progress.percent}%</span>
                    <span className="text-gray-400">({progress.message})</span>
                  </div>

                  <div className="flex items-center gap-3 font-mono">
                    {progress.speedBps > 0 && (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                        <Zap className="w-3.5 h-3.5" />
                        {formatSpeed(progress.speedBps)}
                      </span>
                    )}
                    {progress.etaSeconds > 0 && (
                      <span className="text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        ETA: {progress.etaSeconds}s
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-3 bg-surface rounded-full overflow-hidden mb-3 border border-surfaceLight">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>

                {/* Controls (Pause/Resume/Cancel) */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 font-mono text-[11px]">
                    Segments: {progress.completedSegments} / {progress.totalSegments || '?'}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={togglePause}
                      className="px-3 py-1 rounded-lg bg-surface hover:bg-surfaceLight border border-surfaceLight text-gray-200 transition-colors flex items-center gap-1"
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-3 h-3 text-emerald-400" /> Resume
                        </>
                      ) : (
                        <>
                          <Pause className="w-3 h-3 text-amber-400" /> Pause
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleCancel}
                      className="px-3 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition-colors flex items-center gap-1"
                    >
                      <XCircle className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Completed Notice */}
            {progress.status === 'completed' && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span>Download Finished! Check your downloads folder.</span>
                </div>
                <button
                  onClick={() => {
                    setProgress({
                      status: 'idle',
                      percent: 0,
                      completedSegments: 0,
                      totalSegments: 0,
                      speedBps: 0,
                      etaSeconds: 0,
                    });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-surface text-xs font-medium text-white hover:bg-surfaceLight border border-surfaceLight flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Download Again
                </button>
              </div>
            )}

            {/* Error Notice */}
            {progress.status === 'error' && (
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-center justify-between mt-3">
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <span>{progress.error}</span>
                </div>
                <button
                  onClick={startDownload}
                  className="px-3 py-1 rounded-lg bg-surface text-xs font-semibold text-white hover:bg-surfaceLight border border-surfaceLight"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
