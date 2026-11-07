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
  Film,
  Zap,
  Check,
  Download,
  Sliders,
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

  // Handle Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Handle PiP
  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await videoRef.current.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch (e) {
      console.warn('PiP not supported or denied:', e);
    }
  };

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

  // Autohide controls on inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedTime / duration) * 100 : 0;

  return (
    <div className="w-full max-w-5xl mx-auto mt-6 px-4">
      {/* Theater Player Container */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        className="relative aspect-video w-full rounded-3xl overflow-hidden bg-black shadow-2xl shadow-blue-950/40 border border-surfaceLight group select-none"
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
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs pointer-events-none z-20">
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
            <span className="px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-xs font-bold text-blue-400 flex items-center gap-1.5 shadow-lg">
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
          className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-4 sm:p-6 flex flex-col justify-end z-30 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Timeline / Progress Bar */}
          <div className="relative w-full h-2 mb-3 group/timeline cursor-pointer flex items-center">
            {/* Background Track */}
            <div className="absolute inset-0 bg-white/20 rounded-full" />
            {/* Buffered Buffer Bar */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-white/40 rounded-full transition-all duration-150"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Played Progress Bar */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
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
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </div>

          {/* Controls Bottom Row */}
          <div className="flex items-center justify-between text-white text-xs">
            {/* Left Controls: Play, Rewind, Forward, Time */}
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                onClick={togglePlay}
                className="p-1 text-white hover:text-blue-400 transition-colors"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
              </button>

              <button
                onClick={() => seekRelative(-5)}
                className="p-1 text-gray-300 hover:text-white transition-colors"
                title="Rewind 5s (J)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => seekRelative(5)}
                className="p-1 text-gray-300 hover:text-white transition-colors"
                title="Forward 5s (L)"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume Controls */}
              <div className="flex items-center gap-2 group/volume">
                <button
                  onClick={toggleMute}
                  className="p-1 text-gray-300 hover:text-white transition-colors"
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

              {/* Time Display */}
              <div className="font-mono text-xs text-gray-300">
                <span className="text-white font-semibold">{formatDuration(currentTime)}</span>
                <span className="text-gray-500 mx-1">/</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            {/* Right Controls: Quality, Speed, PiP, Fullscreen */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Settings / Speed Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                    showSettings ? 'bg-surfaceLight text-blue-400' : 'text-gray-300 hover:text-white'
                  }`}
                  title="Playback Settings"
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-[11px] font-semibold">{playbackSpeed}x</span>
                </button>

                {showSettings && (
                  <div className="absolute bottom-10 right-0 w-36 bg-surface/95 backdrop-blur-xl border border-surfaceLight rounded-2xl p-2 shadow-2xl z-50 text-xs">
                    <p className="text-[10px] uppercase font-bold text-gray-400 px-2 py-1 mb-1">
                      Playback Speed
                    </p>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSpeedChange(s)}
                        className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
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
                  className="bg-black/60 border border-white/10 text-white text-xs font-semibold rounded-lg px-2 py-1 outline-none cursor-pointer hover:border-blue-500 transition-colors"
                >
                  {data.qualities.map((q, idx) => (
                    <option key={idx} value={q.url} className="bg-surface text-white">
                      {q.label}
                    </option>
                  ))}
                </select>
              )}

              {/* PiP Button */}
              <button
                onClick={togglePiP}
                className="p-1.5 text-gray-300 hover:text-white transition-colors"
                title="Picture-in-Picture (P)"
              >
                <PictureInPicture className="w-4 h-4" />
              </button>

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="p-1.5 text-gray-300 hover:text-white transition-colors"
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
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
