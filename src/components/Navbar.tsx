'use client';

import React from 'react';
import { DownloadCloud, Zap, Shield, Sparkles } from 'lucide-react';

interface NavbarProps {
  onOpenBatch?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenBatch }) => {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-surfaceLight/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <DownloadCloud className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-xl tracking-tight text-white">
                Vid<span className="text-blue-500">Flow</span>
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 text-blue-400" /> V2 Pro
              </span>
            </div>
            <p className="text-[11px] text-gray-400 hidden sm:block">
              Ultra Multi-Threaded Stream Downloader
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          {onOpenBatch && (
            <button
              onClick={onOpenBatch}
              className="px-3.5 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-surface hover:bg-surfaceLight border border-surfaceLight rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>Batch Queue</span>
            </button>
          )}

          <div className="hidden md:flex items-center space-x-2 text-xs text-gray-400 px-3 py-1 bg-surface/50 border border-surfaceLight/50 rounded-lg">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero Ads & Direct P2C</span>
          </div>
        </div>
      </div>
    </header>
  );
};
