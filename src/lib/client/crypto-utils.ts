// In-browser AES-128 HLS segment decryptor using Web Crypto API

const keyCache = new Map<string, CryptoKey>();

export function parseIvHex(hex: string): Uint8Array | null {
  const h = String(hex || '').replace(/^0x/i, '');
  if (h.length < 32) return null;
  const iv = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    iv[i] = parseInt(h.substring(i * 2, i * 2 + 2), 16) || 0;
  }
  return iv;
}

export function ivFromSequence(seq: number): Uint8Array {
  const iv = new Uint8Array(16);
  const n = Number(seq) || 0;
  const view = new DataView(iv.buffer);
  view.setUint32(8, Math.floor(n / 0x100000000));
  view.setUint32(12, n >>> 0);
  return iv;
}

export async function getCryptoKey(
  keyUrl: string,
  proxyUrlFn: (url: string) => string
): Promise<CryptoKey> {
  if (keyCache.has(keyUrl)) {
    return keyCache.get(keyUrl)!;
  }

  const res = await fetch(proxyUrlFn(keyUrl), {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch AES key (HTTP ${res.status})`);
  }

  const rawBytes = new Uint8Array(await res.arrayBuffer());
  if (rawBytes.byteLength < 16) {
    throw new Error('AES key was less than 16 bytes');
  }

  const keyBytes = rawBytes.slice(0, 16);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );

  keyCache.set(keyUrl, cryptoKey);
  return cryptoKey;
}

export async function decryptAes128Segment(
  encryptedBytes: Uint8Array,
  keyUrl: string,
  ivHex: string | null | undefined,
  sequence: number,
  proxyUrlFn: (url: string) => string
): Promise<Uint8Array> {
  const cryptoKey = await getCryptoKey(keyUrl, proxyUrlFn);
  const iv = ivHex ? parseIvHex(ivHex) : ivFromSequence(sequence);

  if (!iv) {
    throw new Error('Invalid AES initialization vector (IV)');
  }

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    cryptoKey,
    encryptedBytes as BufferSource
  );

  return new Uint8Array(decryptedBuffer);
}
