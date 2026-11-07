'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Square,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Download,
  Film,
  Zap,
  HardDrive,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { StreamExtractResult, DownloadProgress } from '@/types';
import { downloadSingleVideo, DownloadVideoResult } from '@/lib/client/batch-downloader';
import { formatBytes, formatSpeed } from '@/lib/utils';

interface BatchQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult?: (data: StreamExtractResult) => void;
  onDownloadFinished?: (item: {
    title: string;
    site: string;
    quality: string;
    sizeBytes: number;
  }) => void;
}

export interface BatchItem {
  id: string;
  url: string;
  title: string;
  status:
    | 'pending'
    | 'extracting'
    | 'downloading'
    | 'transmuxing'
    | 'completed'
    | 'error'
    | 'cancelled';
  progressPercent: number;
  progressMessage: string;
  speedBps: number;
  sizeBytes?: number;
  filename?: string;
  error?: string;
}

export const BatchQueueModal: React.FC<BatchQueueModalProps> = ({
  isOpen,
  onClose,
  onSelectResult,
  onDownloadFinished,
}) => {
  const [rawInput, setRawInput] = useState('');
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [format, setFormat] = useState<'mp4' | 'ts'>('mp4');
  const [concurrency, setConcurrency] = useState<number>(6);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);

  // Parse links from textarea
  const extractUrls = (text: string): string[] => {
    // Match http/https URLs or bare shortlink IDs
    const urlRegex = /(https?:\/\/[^\s"'<>]+)/gi;
    const matches = text.match(urlRegex) || [];
    const cleaned = matches.map((u) => u.trim().replace(/[.,;)]+$/, ''));
    return Array.from(new Set(cleaned.filter(Boolean)));
  };

  const detectedUrls = extractUrls(rawInput);

  const handleImportLinks = () => {
    if (detectedUrls.length === 0) return;

    const newItems: BatchItem[] = detectedUrls.map((url, i) => ({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      url,
      title: url.split('/').pop() || `Video ${i + 1}`,
      status: 'pending',
      progressPercent: 0,
      progressMessage: 'Menunggu giliran...',
      speedBps: 0,
    }));

    setItems(newItems);
    setRawInput('');
  };

  const handleAddSamples = () => {
    const sampleText = `https://vidara.so/v/T2eNzcmtQF913\nhttps://1024tera.com/s/1xyz\nhttps://vidara.so/v/another_id`;
    setRawInput(sampleText);
  };

  // Run the batch sequence
  const startBatchDownload = async (startIndex = 0) => {
    if (items.length === 0) return;

    setIsProcessing(true);
    setIsPaused(false);
    isPausedRef.current = false;
    isCancelledRef.current = false;

    for (let i = startIndex; i < items.length; i++) {
      if (isCancelledRef.current) break;

      // Skip already completed items
      if (items[i].status === 'completed') continue;

      setCurrentIndex(i);
      abortControllerRef.current = new AbortController();

      // Update state to extracting
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === i
            ? {
                ...item,
                status: 'extracting',
                progressMessage: 'Mengekstrak stream...',
                progressPercent: 5,
              }
            : item
        )
      );

      try {
        const result: DownloadVideoResult = await downloadSingleVideo({
          url: items[i].url,
          format,
          concurrency,
          abortSignal: abortControllerRef.current.signal,
          shouldPause: () => isPausedRef.current,
          onProgress: (prog: DownloadProgress) => {
            setItems((prev) =>
              prev.map((item, idx) => {
                if (idx !== i) return item;

                let mappedStatus = item.status;
                if (prog.status === 'downloading') mappedStatus = 'downloading';
                else if (prog.status === 'transmuxing') mappedStatus = 'transmuxing';
                else if (prog.status === 'extracting') mappedStatus = 'extracting';
                else if (prog.status === 'completed') mappedStatus = 'completed';

                return {
                  ...item,
                  status: mappedStatus,
                  progressPercent: prog.percent,
                  progressMessage: prog.message || '',
                  speedBps: prog.speedBps || 0,
                };
              })
            );
          },
        });

        // Mark item as completed
        setItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: 'completed',
                  title: result.title,
                  filename: result.filename,
                  sizeBytes: result.sizeBytes,
                  progressPercent: 100,
                  progressMessage: `Selesai (${formatBytes(result.sizeBytes)})`,
                  speedBps: 0,
                }
              : item
          )
        );

        onDownloadFinished?.({
          title: result.title,
          site: result.siteName,
          quality: 'Original',
          sizeBytes: result.sizeBytes,
        });

        // Small 1s breathing delay before moving to next item to allow browser to trigger save
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err: any) {
        if (isCancelledRef.current) {
          setItems((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? {
                    ...item,
                    status: 'cancelled',
                    progressMessage: 'Dibatalkan',
                    speedBps: 0,
                  }
                : item
            )
          );
          break;
        }

        setItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: 'error',
                  error: err?.message || 'Download gagal',
                  progressMessage: err?.message || 'Error',
                  speedBps: 0,
                }
              : item
          )
        );
      }
    }

    setIsProcessing(false);
    setCurrentIndex(-1);
  };

  const togglePause = () => {
    const next = !isPaused;
    setIsPaused(next);
    isPausedRef.current = next;
  };

  const cancelBatch = () => {
    isCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    setIsPaused(false);
    isPausedRef.current = false;
    setCurrentIndex(-1);
  };

  const retryItem = (index: number) => {
    if (isProcessing) return;
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              status: 'pending',
              error: undefined,
              progressPercent: 0,
              progressMessage: 'Menunggu antrean...',
            }
          : item
      )
    );
    startBatchDownload(index);
  };

  const removeItem = (index: number) => {
    if (isProcessing && currentIndex === index) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const clearAll = () => {
    cancelBatch();
    setItems([]);
    setRawInput('');
  };

  const completedCount = items.filter((i) => i.status === 'completed').length;
  const errorCount = items.filter((i) => i.status === 'error').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-surface border border-surfaceLight rounded-3xl p-5 sm:p-7 shadow-2xl relative flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-surfaceLight mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Batch Video Downloader</h3>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-full">
                  Otomatis Satu per Satu
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Tempel banyak link TeraBox, Vidara, atau HLS dan sistem akan mendownloadnya otomatis.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (isProcessing) {
                if (confirm('Batch download sedang berjalan. Tutup jendela? (Proses akan dibatalkan)')) {
                  cancelBatch();
                  onClose();
                }
              } else {
                onClose();
              }
            }}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-surfaceLight transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {items.length === 0 ? (
            /* Input Section */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  <Film className="w-4 h-4 text-violet-400" />
                  <span>Daftar Link Video (Satu link per baris atau teks campur):</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddSamples}
                  className="text-xs text-violet-400 hover:text-violet-300 underline"
                >
                  Contoh Link
                </button>
              </div>

              <textarea
                rows={7}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="https://1024tera.com/s/1xyz...&#10;https://vidara.so/v/T2eNzcmtQF913...&#10;https://terabox.com/s/1abc...&#10;Tempel link sebanyak yang Anda inginkan..."
                className="w-full bg-background border border-surfaceLight rounded-2xl p-4 text-xs sm:text-sm text-white placeholder-gray-500 font-mono outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all resize-none"
              />

              {/* Settings Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-surfaceLight/40 border border-surfaceLight text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Format Output:</span>
                  <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-surfaceLight">
                    <button
                      type="button"
                      onClick={() => setFormat('mp4')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                        format === 'mp4'
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      MP4 (Universal)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormat('ts')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                        format === 'ts'
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      TS (Original)
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Kecepatan Chunk:</span>
                  <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-surfaceLight">
                    {[4, 6, 8].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setConcurrency(c)}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                          concurrency === c
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {c}x Thread
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status summary & Import Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="text-xs text-gray-400">
                  {detectedUrls.length > 0 ? (
                    <span className="text-emerald-400 font-semibold">
                      🎯 Terdeteksi {detectedUrls.length} link video valid siap didownload
                    </span>
                  ) : (
                    <span>Salin link dan klik Tambah ke Antrean</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleImportLinks}
                  disabled={detectedUrls.length === 0}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Masukkan ke Antrean ({detectedUrls.length})</span>
                </button>
              </div>
            </div>
          ) : (
            /* Queue Dashboard Section */
            <div className="space-y-4">
              {/* Overall Progress Banner */}
              <div className="p-4 rounded-2xl bg-surfaceLight/50 border border-surfaceLight flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      Progres Antrean: {completedCount} / {items.length} Video Selesai
                    </h4>
                    <p className="text-xs text-gray-400">
                      {isProcessing
                        ? `Sedang mendownload video ke-${currentIndex + 1}...`
                        : completedCount === items.length
                        ? '🎉 Semua video dalam antrean berhasil didownload!'
                        : 'Antrean siap dijalankan.'}
                    </p>
                  </div>
                </div>

                {/* Queue Actions */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {!isProcessing ? (
                    <button
                      type="button"
                      onClick={() => startBatchDownload(0)}
                      disabled={completedCount === items.length}
                      className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>{completedCount > 0 ? 'Lanjutkan Download' : 'Mulai Download Semua'}</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={togglePause}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 transition-all flex items-center gap-1.5"
                      >
                        {isPaused ? <Play className="w-3.5 h-3.5 fill-white" /> : <Pause className="w-3.5 h-3.5 fill-white" />}
                        <span>{isPaused ? 'Resume' : 'Jeda'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={cancelBatch}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-all flex items-center gap-1.5"
                      >
                        <Square className="w-3.5 h-3.5 fill-white" />
                        <span>Stop</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={isProcessing}
                    className="p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-surfaceLight disabled:opacity-50 transition-colors"
                    title="Bersihkan Semua Antrean"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-1">
                {items.map((item, idx) => {
                  const isActive = idx === currentIndex && isProcessing;
                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isActive
                          ? 'bg-violet-950/20 border-violet-500/50 shadow-md shadow-violet-950/20'
                          : item.status === 'completed'
                          ? 'bg-emerald-950/10 border-emerald-500/30'
                          : item.status === 'error'
                          ? 'bg-red-950/10 border-red-500/30'
                          : 'bg-surfaceLight/30 border-surfaceLight'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="w-5 h-5 rounded-md bg-surface border border-surfaceLight text-[11px] font-bold text-gray-400 flex items-center justify-center flex-shrink-0">
                            {idx + 1}
                          </span>

                          <div className="min-w-0 flex-1">
                            <h5 className="text-xs font-semibold text-white truncate" title={item.title}>
                              {item.title}
                            </h5>
                            <p className="text-[10px] text-gray-400 truncate font-mono">{item.url}</p>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {item.status === 'completed' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Selesai</span>
                            </span>
                          )}

                          {item.status === 'error' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                              <AlertCircle className="w-3 h-3" />
                              <span>Gagal</span>
                            </span>
                          )}

                          {item.status === 'pending' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">
                              Antrean
                            </span>
                          )}

                          {isActive && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20 animate-pulse">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>{item.progressPercent}%</span>
                            </span>
                          )}

                          {item.status === 'error' && !isProcessing && (
                            <button
                              type="button"
                              onClick={() => retryItem(idx)}
                              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-surfaceLight transition-colors"
                              title="Coba Lagi"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {!isProcessing && (
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="p-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-surfaceLight transition-colors"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar (when downloading or completed) */}
                      {(isActive || item.status === 'completed' || item.status === 'downloading') && (
                        <div className="space-y-1.5 mt-2">
                          <div className="w-full bg-surfaceLight/80 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                item.status === 'completed'
                                  ? 'bg-emerald-500'
                                  : 'bg-gradient-to-r from-violet-500 to-indigo-500'
                              }`}
                              style={{ width: `${item.progressPercent}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-gray-400">
                            <span className="truncate">{item.progressMessage}</span>
                            {item.speedBps > 0 && (
                              <span className="font-mono text-violet-400 font-semibold flex-shrink-0">
                                {formatSpeed(item.speedBps)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bottom Notice */}
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] flex items-start gap-2">
                <HardDrive className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p>
                  <strong className="font-semibold">Otomatis Tersimpan:</strong> Setiap video yang selesai diunduh akan langsung disimpan oleh browser ke folder Downloads Anda. Jika browser memunculkan konfirmasi izin download banyak file, klik <em>Izinkan</em>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
