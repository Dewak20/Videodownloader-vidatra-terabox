'use client';

import React from 'react';
import { ShieldCheck, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full mt-24 border-t border-surfaceLight/50 bg-background/50 backdrop-blur-md py-12 px-4 text-center">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-4 text-xs text-emerald-400 font-medium">
          <ShieldCheck className="w-4 h-4" />
          <span>Client-Side Processing • Your Data Never Leaves Your Browser</span>
        </div>

        <p className="text-xs text-gray-400 max-w-xl mx-auto mb-6 leading-relaxed">
          VidFlow Downloader is a high-performance utility designed for educational and personal offline video
          archival. Please ensure you respect the content creator&apos;s copyright when downloading.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500 mb-6">
          <span>Supported: Vidara (.so, .to, .fit)</span>
          <span>•</span>
          <span>Vidvara.fit</span>
          <span>•</span>
          <span>LuluStream</span>
          <span>•</span>
          <span>Raw HLS (.m3u8)</span>
          <span>•</span>
          <span>Direct MP4</span>
        </div>

        <div className="text-[11px] text-gray-600 flex items-center justify-center gap-1">
          <span>© {new Date().getFullYear()} VidFlow Pro. Engineered for Speed & Reliability.</span>
        </div>
      </div>
    </footer>
  );
};
