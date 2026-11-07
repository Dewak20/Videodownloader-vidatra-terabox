'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from '@/components/Navbar';
import { UrlInputForm } from '@/components/UrlInputForm';
import { ModernStreamPlayer } from '@/components/ModernStreamPlayer';
import { VideoPreviewCard } from '@/components/VideoPreviewCard';
import { FeatureHighlights } from '@/components/FeatureHighlights';
import { DownloadHistory } from '@/components/DownloadHistory';
import { BatchQueueModal } from '@/components/BatchQueueModal';
import { Footer } from '@/components/Footer';
import { StreamExtractResult, DownloadHistoryItem } from '@/types';
import { AlertCircle, X, Download } from 'lucide-react';

export default function HomePage() {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [extractData, setExtractData] = useState<StreamExtractResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBatchOpen, setIsBatchOpen] = useState<boolean>(false);
  const [showDownloadCard, setShowDownloadCard] = useState<boolean>(false);
  const [historyItems, setHistoryItems] = useState<DownloadHistoryItem[]>([]);

  const playerSectionRef = useRef<HTMLDivElement | null>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vidflow_history');
      if (saved) {
        setHistoryItems(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  const saveHistory = (items: DownloadHistoryItem[]) => {
    setHistoryItems(items);
    try {
      localStorage.setItem('vidflow_history', JSON.stringify(items));
    } catch {
      // ignore
    }
  };

  const handleExtract = async (url: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setExtractData(null);
    setShowDownloadCard(false);

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(
          data.error || 'Failed to extract video stream. Please verify the URL or ID.'
        );
        return;
      }

      setExtractData(data);

      // Smooth scroll to player
      setTimeout(() => {
        playerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error while contacting extraction server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadFinished = (item: {
    title: string;
    site: string;
    quality: string;
    sizeBytes: number;
  }) => {
    const newItem: DownloadHistoryItem = {
      id: Math.random().toString(36).substring(2, 9),
      title: item.title,
      site: item.site,
      quality: item.quality,
      sizeBytes: item.sizeBytes,
      filename: item.title,
      timestamp: Date.now(),
    };

    const updated = [newItem, ...historyItems.slice(0, 19)];
    saveHistory(updated);
  };

  const handleClearHistory = () => {
    saveHistory([]);
  };

  return (
    <div className="flex-1 flex flex-col justify-between">
      <Navbar onOpenBatch={() => setIsBatchOpen(true)} />

      <main className="flex-1 pt-12 sm:pt-16 pb-16">
        <UrlInputForm
          onExtract={handleExtract}
          isLoading={isLoading}
          onOpenBatch={() => setIsBatchOpen(true)}
        />

        {/* Error Alert Box */}
        {errorMessage && (
          <div className="w-full max-w-3xl mx-auto mt-6 px-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs sm:text-sm flex items-start justify-between gap-3 shadow-lg shadow-red-950/20">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">{errorMessage}</p>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="p-1 rounded-lg text-red-400 hover:text-white hover:bg-red-500/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Primary Focus: Modern Online Stream Player */}
        {extractData && (
          <div ref={playerSectionRef} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ModernStreamPlayer
              data={extractData}
              onOpenDownload={() => setShowDownloadCard((prev) => !prev)}
            />

            {/* Optional Collapsible Download Panel */}
            {showDownloadCard && (
              <div className="w-full max-w-4xl mx-auto mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <VideoPreviewCard
                  data={extractData}
                  onDownloadFinished={handleDownloadFinished}
                />
              </div>
            )}
          </div>
        )}

        {/* Feature Highlights Grid */}
        <FeatureHighlights />

        {/* Download History */}
        <DownloadHistory items={historyItems} onClear={handleClearHistory} />
      </main>

      <Footer />

      {/* Batch Queue Modal */}
      <BatchQueueModal
        isOpen={isBatchOpen}
        onClose={() => setIsBatchOpen(false)}
        onDownloadFinished={handleDownloadFinished}
        onSelectResult={(data) => {
          setExtractData(data);
          setErrorMessage(null);
          setTimeout(() => {
            playerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }}
      />
    </div>
  );
}
