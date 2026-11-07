# VidFlow Downloader ⚡

**VidFlow Downloader** adalah aplikasi Web SaaS generasi baru untuk mengunduh video & stream dari host seperti **Vidara (`vidara.so`, `vidara.to`, `vidara.fit`)**, **Vidvara (`vidvara.fit`)**, **LuluStream**, dan **Raw HLS Stream (`.m3u8`)** secara instan dengan kecepatan multi-threaded, bebas iklan, dan transmuxing MP4 langsung di browser.

---

## 🚀 Fitur Unggulan & Upgrade vs LuLuDownloader

1. **Multi-Threaded Parallel Chunk Pipeline (Up to 8x Faster):**
   * Berbeda dengan LuLuDownloader yang mengunduh 1 segmen demi satu segmen (sekuensial), VidFlow menjalankan **4–8 worker threads bersamaan**.
   * Pemanfaatan bandwidth maksimal sehingga proses download selesai berkali-kali lipat lebih cepat.

2. **Zero Server CPU/Transcode Cost (Client-Side Remuxing):**
   * Menggunakan **`mux.js`** dan **Web Crypto API** langsung di memori browser pengguna.
   * Segmen HLS (`.ts`) atau fMP4 dikonversi menjadi file `.mp4` standar tanpa perlu membebani server backend Anda.
   * Server hanya bertindak sebagai perantara proxy I/O yang sangat ringan.

3. **Pilihan Resolusi Fleksibel:**
   * Membedah Master M3U8 sehingga pengguna bebas memilih resolusi (1080p, 720p, 480p, 360p) sebelum mengunduh.

4. **Pause, Resume, & Cancel:**
   * Download video berukuran besar dapat dijeda (*pause*) dan dilanjutkan (*resume*) kapan saja tanpa harus mengulang dari 0%.

5. **100% Bersih & Bebas Jebakan Iklan:**
   * Tidak ada trik *double-click*, popunder, atau pengalihan ke situs iklan mencurigakan. Satu klik langsung proses download.

6. **Batch Queue Downloader:**
   * Mendukung penempelan banyak tautan sekaligus untuk antrean ekstraksi otomatis.

7. **Video Player Preview (Hls.js):**
   * Pengguna bisa menonton cuplikan video secara langsung di web sebelum memutuskan untuk mengunduh.

---

## 🛠️ Tech Stack

* **Frontend:** Next.js 14 (App Router), React 18, Tailwind CSS, Lucide Icons
* **Video Engine:** `hls.js`, `mux.js`, Web Crypto API (`AES-CBC 128-bit`)
* **Backend:** Next.js Route Handlers (`/api/extract`, `/api/resolve-hls`, `/api/proxy`) dengan Node.js native streaming
* **Storage:** LocalStorage (Session Download History)

---

## 💻 Cara Menjalankan

### 1. Install Dependencies
```bash
npm install
```

### 2. Jalankan Server Development
```bash
npm run dev
```
Aplikasi akan aktif di `http://localhost:3000`.

### 3. Build Production
```bash
npm run build
npm start
```

---

## 📂 Struktur Proyek

```
vidflow-downloader/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── extract/route.ts      # Ekstraktor metadata & resolver kualitas
│   │   │   ├── resolve-hls/route.ts  # Parser segmen M3U8 & enkripsi AES-128
│   │   │   └── proxy/route.ts        # Streaming reverse proxy (CORS bypass)
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                  # Dashboard utama VidFlow
│   ├── components/
│   │   ├── Navbar.tsx                # Header bar & badge Pro
│   │   ├── UrlInputForm.tsx          # Input link, paste, sample links
│   │   ├── VideoPreviewCard.tsx      # Video player, speedometer, download controls
│   │   ├── BatchQueueModal.tsx       # Modal antrean download massal
│   │   ├── DownloadHistory.tsx       # Riwayat unduhan lokal
│   │   ├── FeatureHighlights.tsx     # Kartu fitur keunggulan
│   │   └── Footer.tsx
│   ├── lib/
│   │   ├── client/
│   │   │   ├── crypto-utils.ts       # Dekripsi AES-128 via Web Crypto
│   │   │   ├── multi-chunk-downloader.ts # Worker pool paralel & speedometer
│   │   │   └── transmuxer.ts         # In-browser TS to MP4 converter
│   │   ├── server/
│   │   │   ├── extractors/           # Modular resolver (Vidara, Vidvara, dsb)
│   │   │   ├── hls-parser.ts         # Parser manifest HLS
│   │   │   └── http-client.ts        # Node native request helper
│   │   └── utils.ts
│   └── types/
│       └── index.ts
├── package.json
├── tailwind.config.js
└── tsconfig.json
```
