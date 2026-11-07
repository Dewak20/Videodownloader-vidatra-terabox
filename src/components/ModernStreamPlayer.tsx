'use client';

import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  PictureInPicture,
  RotateCcw,
  RotateCw,
  Check,
  Download,
} from 'lucide-react';
import { StreamExtractResult, QualityOption } from '@/types';
import { formatDuration } from '@/lib/utils';

interface ModernStreamPlayerProps {
  data: StreamExtractResult;
  onOpenDownload?: () => void;
}

export const ModernStreamPlayer: React.FC<ModernStreamPlayerProps> = ({
  data,
  onOpenDownload,
}) => {
  const [selectedQuality, setSelectedQuality] = useState<QualityOption | null>(
    data.qualities && data.qualities.length > 0 ? data.qualities[0] : null
  );

  // Player state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(data.duration || 0);
  const [bufferedTime, setBufferedTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPiP, setIsPiP] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [supportsPiP, setSupportsPiP] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stream URL to load
  const streamUrl = selectedQuality?.url || data.streamingUrl;

  // Initialize Hls.js with high-performance buffer settings
  useEffect(() => {
    if (!videoRef.current || !streamUrl) return;

    const proxiedUrl = `/api/proxy?url=${encodeURIComponent(streamUrl)}&ref=${encodeURIComponent(
      data.referer || ''
    )}`;

    const video = videoRef.current;

    if (data.streamType === 'mp4' || /\.mp4(\?|$)/i.test(streamUrl)) {
      video.src = proxiedUrl;
      video.play().catch(() => {});
      return;
    }

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90, // Keep 90s back-buffer for instant rewind
        maxBufferLength: 60, // Buffer 60s ahead
        maxMaxBufferLength: 120,
        maxBufferSize: 60 * 1024 * 1024, // 60MB max buffer
        maxBufferHole: 0.5, // Gracefully jump small gaps without stall
        nudgeOffset: 0.2,
        nudgeMaxRetry: 5,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });

      hls.loadSource(proxiedUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_event, levelData) => {
        if (levelData.details && levelData.details.totalduration) {
          setDuration(levelData.details.totalduration);
        }
      });

      hls.on(Hls.Events.BUFFER_APPENDING, () => {
        setIsBuffering(false);
      });

      hls.on(Hls.Events.ERROR, (_event, errorData) => {
        if (errorData.fatal) {
          switch (errorData.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('Network error, attempting recovery...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('Media error, attempting recovery...');
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = proxiedUrl;
      video.play().catch(() => {});
    }
  }, [streamUrl, data.streamType, data.referer]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  };

  // Handle Seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const seekRelative = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
  };

  // Handle Volume
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRef.current.muted = nextMuted;
  };

  // Handle Speed
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSettings(false);
  };

  // Handle Fullscreen (cross-platform).
  // iPhone Safari does NOT support the Fullscreen API (requestFullscreen),
  // so fall back to native video fullscreen via webkitEnterFullscreen().
  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current as
      | (HTMLVideoElement & {
          webkitEnterFullscreen?: () => void;
          webkitSupportsFullscreen?: boolean;
        })
      | null;
    if (!container || !video) return;

    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => void;
    };
    const activeElement = doc.fullscreenElement || doc.webkitFullscreenElement;

    // Already fullscreen -> exit
    if (activeElement) {
      if (doc.fullscreenElement) {
        doc.exitFullscreen().catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
      return;
    }

    if (typeof container.requestFullscreen === 'function') {
      // iPad Safari + all desktop browsers
      container.requestFullscreen().catch(() => {});
    } else if (
      typeof video.webkitEnterFullscreen === 'function' &&
      video.webkitSupportsFullscreen !== false
    ) {
      // iPhone Safari: only native <video> fullscreen is available
      video.webkitEnterFullscreen();
    } else {
      const c = container as HTMLDivElement & { webkitRequestFullscreen?: () => void };
      c.webkitRequestFullscreen?.();
    }
  };

  // Handle PiP (desktop Picture-in-Picture API + iOS webkitSetPresentationMode fallback)
  const togglePiP = async () => {
    const video = videoRef.current as
      | (HTMLVideoElement & {
          webkitSetPresentationMode?: (mode: string) => void;
          webkitPresentationMode?: string;
        })
      | null;
    if (!video) return;
    try {
      if (typeof video.webkitSetPresentationMode === 'function') {
        const mode =
          video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture';
        video.webkitSetPresentationMode(mode);
        setIsPiP(mode === 'picture-in-picture');
        return;
      }
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await video.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch (e) {
      console.warn('PiP not supported or denied:', e);
    }
  };

  // Sync fullscreen / PiP state with the browser.
  // Needed on iOS, where native fullscreen changes don't go through React's
  // optimistic setIsFullscreen calls.
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element };
    const video = videoRef.current as HTMLVideoElement & { webkitPresentationMode?: string } | null;

    const syncFullscreen = () => {
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    const syncPresentationMode = () => {
      if (!video) return;
      const mode = video.webkitPresentationMode;
      setIsFullscreen(mode === 'fullscreen');
      setIsPiP(mode === 'picture-in-picture');
    };

    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    video?.addEventListener('webkitpresentationmodechanged', syncPresentationMode);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
      video?.removeEventListener('webkitpresentationmodechanged', syncPresentationMode);
    };
  }, []);

  // Detect PiP support (iPhone Safari without PiP support won't show the button)
  useEffect(() => {
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitSetPresentationMode?: unknown })
      | null;
    if (
      video &&
      (typeof video.webkitSetPresentationMode === 'function' || document.pictureInPictureEnabled)
    ) {
      setSupportsPiP(true);
    }
  }, []);

  // Video listeners
  const onTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    if (videoRef.current.duration && !Number.isNaN(videoRef.current.duration) && videoRef.current.duration !== Infinity) {
      setDuration(videoRef.current.duration);
    }
    // Update buffered progress
    const b = videoRef.current.buffered;
    if (b.length > 0) {
      setBufferedTime(b.end(b.length - 1));
    }
  };

  const onLoadedMetadata = () => {
    if (!videoRef.current) return;
    if (videoRef.current.duration && !Number.isNaN(videoRef.current.duration) && videoRef.current.duration !== Infinity) {
      setDuration(videoRef.current.duration);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          e.preventDefault();
          seekRelative(-5);
          break;
        case 'ArrowRight':
        case 'KeyL':
          e.preventDefault();
          seekRelative(5);
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
        case 'KeyP':
          e.preventDefault();
          togglePiP();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration, isPlaying, isMuted]);

  // Autohide controls on inactivity (mouse on desktop, touch on mobile)
  const revealControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };
  const handleMouseMove = revealControls;

  useEffect(
    () => () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    },
    []
  );

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedTime / duration) * 100 : 0;

  return (
    <div className="w-full max-w-5xl mx-auto mt-6 px-4">
      {/* Theater Player Container */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        onTouchStart={revealControls}
        className="relative aspect-video w-full rounded-3xl overflow-hidden bg-black shadow-2xl shadow-blue-950/40 border border-surfaceLight group select-none touch-manipulation"
      >
        {/* Core Video Element */}
        <video
          ref={videoRef}
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onClick={togglePlay}
          className="w-full h-full object-contain cursor-pointer"
        />

        {/* Buffering Spinner Overlay */}
        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none z-20">
            <div className="w-16 h-16 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
          </div>
        )}

        {/* Big Center Play Button (When Paused) */}
        {!isPlaying && !isBuffering && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-blue-600/90 hover:bg-blue-500 text-white flex items-center justify-center backdrop-blur-md transition-all transform hover:scale-110 shadow-2xl shadow-blue-600/50 z-20"
          >
            <Play className="w-9 h-9 ml-1 fill-white" />
          </button>
        )}

        {/* Top Badges Overlay */}
        <div
          className={`absolute top-4 left-4 right-4 flex items-center justify-between z-30 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[10px] sm:text-xs font-bold text-blue-400 flex items-center gap-1.5 shadow-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {data.siteName || 'Vidara Streaming'}
            </span>
            {selectedQuality && (
              <span className="px-2.5 py-1 rounded-full bg-surfaceLight/80 text-white text-[11px] font-semibold border border-surfaceLight backdrop-blur-md">
                {selectedQuality.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-300 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 hidden sm:inline-block">
              ⌨️ Space (Play) • J/L (±5s) • F (Fullscreen)
            </span>
          </div>
        </div>

        {/* Bottom Custom Controls Bar */}
        <div
          className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3 pt-8 sm:p-6 flex flex-col justify-end z-30 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Timeline / Progress Bar (extra padding = bigger touch target) */}
          <div className="relative w-full py-2 cursor-pointer flex items-center">
            {/* Background Track */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 sm:h-2 bg-white/20 rounded-full" />
            {/* Buffered Bar */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 sm:h-2 bg-white/40 rounded-full transition-all duration-150"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Played Progress Bar */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 sm:h-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Native Slider Input for Scrubbing */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Seek"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 touch-none"
            />
          </div>

          {/* Controls Bottom Row */}
          <div className="flex items-center justify-between gap-1 text-white text-xs">
            {/* Left Controls: Play, Rewind, Forward, Time */}
            <div className="flex items-center gap-0.5 sm:gap-4">
              <button
                onClick={togglePlay}
                className="p-2 sm:p-1 rounded-lg text-white hover:text-blue-400 active:bg-white/15 sm:active:bg-transparent transition-colors"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
              </button>

              <button
                onClick={() => seekRelative(-5)}
                className="p-2 sm:p-1 rounded-lg text-gray-300 hover:text-white active:bg-white/15 sm:active:bg-transparent transition-colors"
                title="Rewind 5s (J)"
                aria-label="Rewind 5 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => seekRelative(5)}
                className="p-2 sm:p-1 rounded-lg text-gray-300 hover:text-white active:bg-white/15 sm:active:bg-transparent transition-colors"
                title="Forward 5s (L)"
                aria-label="Forward 5 seconds"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume Controls (hidden on mobile — mobile OS controls volume natively) */}
              <div className="hidden sm:flex items-center gap-2 group/volume">
                <button
                  onClick={toggleMute}
                  className="p-2 rounded-lg text-gray-300 hover:text-white transition-colors"
                  title="Mute / Unmute (M)"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-14 sm:w-20 h-1 accent-blue-500 bg-white/30 rounded-lg cursor-pointer"
                />
              </div>

              {/* Time Display (duration hidden on mobile to save space) */}
              <div className="font-mono text-[11px] sm:text-xs whitespace-nowrap">
                <span className="text-white font-semibold">{formatDuration(currentTime)}</span>
                <span className="text-gray-500 mx-1 hidden sm:inline">/</span>
                <span className="hidden sm:inline text-gray-500">{formatDuration(duration)}</span>
              </div>
            </div>

            {/* Right Controls: Quality, Speed, PiP, Fullscreen */}
            <div className="flex items-center gap-0.5 sm:gap-3 flex-shrink-0">
              {/* Settings / Speed Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-2 sm:p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                    showSettings ? 'bg-surfaceLight text-blue-400' : 'text-gray-300 hover:text-white active:bg-white/15 sm:active:bg-transparent'
                  }`}
                  title="Playback Settings"
                  aria-label="Playback Settings"
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-[11px] font-semibold hidden sm:inline">{playbackSpeed}x</span>
                </button>

                {showSettings && (
                  <div className="absolute bottom-11 sm:bottom-10 right-0 w-36 bg-surface/95 backdrop-blur-xl border border-surfaceLight rounded-2xl p-2 shadow-2xl z-50 text-xs">
                    <p className="text-[10px] uppercase font-bold text-gray-400 px-2 py-1 mb-1">
                      Playback Speed
                    </p>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSpeedChange(s)}
                        className={`w-full text-left min-h-[36px] px-2 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                          playbackSpeed === s ? 'bg-blue-600/20 text-blue-400 font-bold' : 'text-gray-300 hover:bg-surfaceLight'
                        }`}
                      >
                        <span>{s}x</span>
                        {playbackSpeed === s && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quality Selector */}
              {data.qualities && data.qualities.length > 1 && (
                <select
                  value={selectedQuality?.url || ''}
                  onChange={(e) => {
                    const q = data.qualities?.find((item) => item.url === e.target.value);
                    if (q) setSelectedQuality(q);
                  }}
                  className="bg-black/60 border border-white/10 text-white text-[11px] sm:text-xs font-semibold rounded-lg px-1.5 sm:px-2 py-2 sm:py-1 max-w-[90px] sm:max-w-none outline-none cursor-pointer hover:border-blue-500 transition-colors"
                >
                  {data.qualities.map((q, idx) => (
                    <option key={idx} value={q.url} className="bg-surface text-white">
                      {q.label}
                    </option>
                  ))}
                </select>
              )}

              {/* PiP Button (hidden when the browser can't do PiP, e.g. iPhone) */}
              {supportsPiP && (
                <button
                  onClick={togglePiP}
                  className="p-2 sm:p-1.5 rounded-lg text-gray-300 hover:text-white active:bg-white/15 sm:active:bg-transparent transition-colors"
                  title="Picture-in-Picture (P)"
                  aria-label="Picture in Picture"
                >
                  <PictureInPicture className="w-4 h-4" />
                </button>
              )}

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="p-2 sm:p-1.5 rounded-lg text-gray-300 hover:text-white active:bg-white/15 sm:active:bg-transparent transition-colors"
                title="Fullscreen (F)"
                aria-label="Fullscreen"
              >
                {isFullscreen ? <Minimize className="w-5 h-5 sm:w-4 sm:h-4" /> : <Maximize className="w-5 h-5 sm:w-4 sm:h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Video Details & Action Toolbar */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-surface border border-surfaceLight/80 shadow-xl">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug line-clamp-2 mb-1">
            {data.title || `Video_${data.filecode || 'Stream'}`}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span className="font-semibold text-emerald-400">{data.siteName || 'Vidara Direct'}</span>
            <span>•</span>
            <span className="font-mono text-gray-300">ID: {data.filecode || 'N/A'}</span>
            <span>•</span>
            <span>Duration: {formatDuration(duration)}</span>
          </div>
        </div>

        {onOpenDownload && (
          <button
            onClick={onOpenDownload}
            className="px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-surfaceLight hover:bg-surfaceLight/80 border border-surfaceLight flex items-center justify-center gap-2 transition-all whitespace-nowrap shadow-sm hover:border-blue-500/50"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span>Download Offline Copy</span>
          </button>
        )}
      </div>
    </div>
  );
};
