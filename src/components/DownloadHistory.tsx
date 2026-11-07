'use client';

import React from 'react';
import { History, Trash2, CheckCircle2 } from 'lucide-react';
import { DownloadHistoryItem } from '@/types';
import { formatBytes } from '@/lib/utils';

interface DownloadHistoryProps {
  items: DownloadHistoryItem[];
  onClear: () => void;
}

export const DownloadHistory: React.FC<DownloadHistoryProps> = ({ items, onClear }) => {
  if (items.length === 0) return null;

  return (
    <div className="w-full max-w-4xl mx-auto mt-16 px-4">
      <div className="flex items-center justify-between pb-3 border-b border-surfaceLight mb-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Recent Downloads in this Session
          </h3>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear History
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-surfaceLight/60 text-xs"
          >
            <div className="flex items-center gap-3 min-w-0 mr-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="truncate">
                <p className="text-white font-medium truncate text-xs">{item.title}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                  <span className="font-semibold text-blue-400">{item.site}</span>
                  <span>•</span>
                  <span>{item.quality}</span>
                  {item.sizeBytes ? (
                    <>
                      <span>•</span>
                      <span>{formatBytes(item.sizeBytes)}</span>
                    </>
                  ) : null}
                  <span>•</span>
                  <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-md bg-surfaceLight text-emerald-400 font-semibold text-[10px] uppercase">
              Saved
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
