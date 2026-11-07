'use client';

import React from 'react';
import { Zap, ShieldCheck, SlidersHorizontal, RefreshCw } from 'lucide-react';

export const FeatureHighlights: React.FC = () => {
  const features = [
    {
      icon: <Zap className="w-6 h-6 text-blue-400" />,
      title: '6x Multi-Thread Acceleration',
      description:
        'Instead of downloading 1 chunk at a time, VidFlow opens up to 8 concurrent worker streams simultaneously for maximum bandwidth saturation.',
    },
    {
      icon: <ShieldCheck className="w-6 h-6 text-emerald-400" />,
      title: '100% Ad & Spam Free',
      description:
        'No deceptive double-click traps, no popunder tabs, and no shady redirects. Just paste your link and download instantly.',
    },
    {
      icon: <SlidersHorizontal className="w-6 h-6 text-violet-400" />,
      title: 'Resolution Freedom',
      description:
        'Unlike basic downloaders, VidFlow parses the master manifest so you can pick from 1080p Full HD down to 360p to save mobile data.',
    },
    {
      icon: <RefreshCw className="w-6 h-6 text-amber-400" />,
      title: 'Pause, Resume & Remux',
      description:
        'Pause and resume large video downloads anytime. Automatically converts HLS stream chunks into standard MP4 right inside your browser.',
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto mt-20 px-4">
      <div className="text-center mb-12">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-3">
          Engineered to Outperform Legacy Downloaders
        </h2>
        <p className="text-sm text-gray-400 max-w-xl mx-auto">
          Built with modern Web Crypto, Web Streams, and multi-worker architecture for unbeatable reliability.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feat, idx) => (
          <div
            key={idx}
            className="p-6 rounded-2xl bg-surface/60 border border-surfaceLight/60 hover:border-blue-500/30 transition-all hover:-translate-y-1 group"
          >
            <div className="w-12 h-12 rounded-xl bg-surfaceLight/50 flex items-center justify-center mb-4 group-hover:bg-blue-500/10 transition-colors">
              {feat.icon}
            </div>
            <h3 className="text-base font-bold text-white mb-2">{feat.title}</h3>
            <p className="text-xs text-gray-400 leading-relaxed">{feat.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
