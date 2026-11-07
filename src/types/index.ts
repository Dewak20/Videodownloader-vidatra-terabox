export interface QualityOption {
  label: string;
  resolution: string;
  bandwidth: number;
  url: string;
}

export interface StreamExtractResult {
  success: boolean;
  url?: string;
  site?: string;
  siteName?: string;
  title?: string;
  thumbnail?: string;
  filecode?: string;
  streamType?: 'hls' | 'mp4';
  streamingUrl?: string;
  referer?: string;
  embedUrl?: string;
  qualities?: QualityOption[];
  duration?: number;
  error?: string;
}

export interface HlsSegment {
  url: string;
  duration: number;
  sequence: number;
  key?: {
    method: string;
    url: string;
    iv?: string | null;
  } | null;
}

export interface ResolvedHlsData {
  success: boolean;
  isMaster?: boolean;
  variants?: QualityOption[];
  segments?: HlsSegment[];
  initSegment?: string | null;
  encrypted?: boolean;
  duration?: number;
  resolution?: string;
  sizeLabel?: string;
  error?: string;
}

export type DownloadStatus = 
  | 'idle'
  | 'extracting'
  | 'fetching-manifest'
  | 'downloading'
  | 'paused'
  | 'decrypting'
  | 'transmuxing'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface DownloadProgress {
  status: DownloadStatus;
  percent: number;
  completedSegments: number;
  totalSegments: number;
  speedBps: number;
  etaSeconds: number;
  message?: string;
  error?: string;
}

export interface DownloadHistoryItem {
  id: string;
  title: string;
  thumbnail?: string;
  site: string;
  quality: string;
  timestamp: number;
  sizeBytes?: number;
  filename: string;
}
