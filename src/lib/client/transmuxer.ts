// In-browser TS to MP4 Transmuxer using mux.js (Lightweight, ~50KB, Zero Wasm overhead)
import muxjs from 'mux.js';

export function transmuxTsToMp4(tsSegments: Uint8Array[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      const transmuxer = new (muxjs.mp4.Transmuxer as any)({
        remux: true,
      });

      const initSegments: Uint8Array[] = [];
      const mediaSegments: Uint8Array[] = [];

      transmuxer.on('data', (segment: any) => {
        if (segment.initSegment) {
          initSegments.push(new Uint8Array(segment.initSegment));
        }
        if (segment.data) {
          mediaSegments.push(new Uint8Array(segment.data));
        }
      });

      transmuxer.on('done', () => {
        // Calculate total size
        let totalSize = 0;
        for (const seg of initSegments) totalSize += seg.byteLength;
        for (const seg of mediaSegments) totalSize += seg.byteLength;

        if (totalSize === 0) {
          // Fallback if muxer didn't produce data: return raw concatenated TS
          let rawSize = 0;
          for (const s of tsSegments) rawSize += s.byteLength;
          const raw = new Uint8Array(rawSize);
          let offset = 0;
          for (const s of tsSegments) {
            raw.set(s, offset);
            offset += s.byteLength;
          }
          resolve(raw);
          return;
        }

        const combinedMp4 = new Uint8Array(totalSize);
        let offset = 0;

        for (const seg of initSegments) {
          combinedMp4.set(seg, offset);
          offset += seg.byteLength;
        }

        for (const seg of mediaSegments) {
          combinedMp4.set(seg, offset);
          offset += seg.byteLength;
        }

        resolve(combinedMp4);
      });

      // Push all TS segments into transmuxer
      for (const seg of tsSegments) {
        transmuxer.push(seg);
      }
      transmuxer.flush();
    } catch (err) {
      console.error('Transmux error, falling back to raw TS stream:', err);
      // Fallback: concatenate TS segments
      let rawSize = 0;
      for (const s of tsSegments) rawSize += s.byteLength;
      const raw = new Uint8Array(rawSize);
      let offset = 0;
      for (const s of tsSegments) {
        raw.set(s, offset);
        offset += s.byteLength;
      }
      resolve(raw);
    }
  });
}

export function saveBlob(bytes: Uint8Array, filename: string, mimeType = 'video/mp4') {
  const blob = new Blob([bytes as any], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
