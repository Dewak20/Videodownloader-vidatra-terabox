import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VidFlow Downloader — High-Speed Vidara & HLS Stream Downloader',
  description:
    'Download Vidara, Vidvara, and HLS streaming videos with multi-threaded speed, custom resolution selection, and zero pop-up ads.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-[#090d16] text-white antialiased selection:bg-blue-600 selection:text-white">
        {/* Glow ambient background circles */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[450px] bg-gradient-to-b from-blue-600/15 via-indigo-600/10 to-transparent blur-[120px] pointer-events-none -z-10" />
        <div className="fixed top-[400px] -left-40 w-[500px] h-[500px] bg-violet-600/10 blur-[140px] pointer-events-none -z-10" />

        {children}
      </body>
    </html>
  );
}
