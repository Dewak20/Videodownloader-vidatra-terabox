'use client';

import React, { useState } from 'react';
import { Play, Clipboard, Loader2, X, CheckCircle2, Film } from 'lucide-react';

interface UrlInputFormProps {
  onExtract: (url: string) => Promise<void>;
  isLoading: boolean;
  onOpenBatch?: () => void;
}

export const UrlInputForm: React.FC<UrlInputFormProps> = ({ onExtract, isLoading, onOpenBatch }) => {
  const [url, setUrl] = useState('');
  const [pasted, setPasted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim() && !isLoading) {
      onExtract(url.trim());
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        setPasted(true);
        setTimeout(() => setPasted(false), 2000);
      }
    } catch {
      // clipboard permission denied
    }
  };

  const handleSample = (sampleUrl: string) => {
    setUrl(sampleUrl);
    onExtract(sampleUrl);
  };

  return (
    <div className="w-full max-w-4xl mx-auto text-center px-4">
      {/* Hero Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-4">
        <span>🎬 Smooth Online Stream Player</span>
        <span className="text-gray-500">•</span>
        <span>TeraBox & Vidara</span>
        <span className="text-gray-500">•</span>
        <span>Zero Pop-up Ads</span>
        <span className="text-gray-500">•</span>
        <span>Accurate Duration</span>
      </div>

      <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4 leading-tight">
        High-Speed Stream & Video{' '}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400">
          Player
        </span>
      </h1>
      <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto mb-8">
        Watch and stream videos from <span className="text-gray-200 font-medium">TeraBox / 1024Tera</span>,{' '}
        <span className="text-gray-200 font-medium">Vidara</span>, and raw HLS streams with accurate
        full-length duration and buffer-free performance.
      </p>

      {/* Main Input Box */}
      <form onSubmit={handleSubmit} className="relative max-w-3xl mx-auto mb-4">
        <div className="relative flex items-center bg-surface border border-surfaceLight/80 rounded-2xl shadow-2xl shadow-blue-950/20 p-2 focus-within:border-blue-500/80 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
          <div className="pl-3 pr-2 text-gray-400">
            <Film className="w-5 h-5 text-blue-400" />
          </div>

          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste TeraBox (terabox.com / 1024tera.com) or Vidara link..."
            className="w-full bg-transparent text-white placeholder-gray-500 text-sm sm:text-base outline-none px-2 py-2"
            disabled={isLoading}
          />

          {url && (
            <button
              type="button"
              onClick={() => setUrl('')}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handlePaste}
            className="hidden sm:flex items-center gap-1 px-3 py-2 text-xs font-medium text-gray-300 hover:text-white bg-surfaceLight/60 hover:bg-surfaceLight rounded-xl transition-all mr-2"
          >
            {pasted ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Pasted</span>
              </>
            ) : (
              <>
                <Clipboard className="w-3.5 h-3.5" />
                <span>Paste</span>
              </>
            )}
          </button>

          <button
            type="submit"
            disabled={!url.trim() || isLoading}
            className="px-6 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading Stream...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Stream Video</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Quick Sample Link Chips & Batch Button */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs text-gray-400">
        <span>Quick Samples:</span>
        <button
          type="button"
          onClick={() => handleSample('https://vidara.so/v/T2eNzcmtQF913')}
          className="px-2.5 py-1 rounded-lg bg-surface/80 hover:bg-surfaceLight border border-surfaceLight text-blue-400 hover:text-blue-300 transition-colors"
        >
          Vidara Full HD (43m)
        </button>
        <button
          type="button"
          onClick={() => handleSample('https://1024tera.com/s/1xyz')}
          className="px-2.5 py-1 rounded-lg bg-surface/80 hover:bg-surfaceLight border border-surfaceLight text-violet-400 hover:text-violet-300 transition-colors"
        >
          TeraBox / 1024Tera Link
        </button>

        {onOpenBatch && (
          <button
            type="button"
            onClick={onOpenBatch}
            className="px-3 py-1 rounded-lg bg-gradient-to-r from-violet-600/20 to-indigo-600/20 hover:from-violet-600/30 hover:to-indigo-600/30 border border-violet-500/40 text-violet-300 hover:text-white font-medium flex items-center gap-1.5 transition-all shadow-sm"
          >
            <span>📥 Batch Download (Banyak Link)</span>
          </button>
        )}
      </div>
    </div>
  );
};
