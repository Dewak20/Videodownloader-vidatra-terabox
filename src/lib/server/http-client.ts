import https from 'node:https';
import { URL } from 'node:url';

export interface HttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: () => Promise<string>;
  json: <T = any>() => Promise<T>;
}

export function nativeRequest(
  urlStr: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    /** Socket inactivity timeout in ms (default 20s) */
    timeoutMs?: number;
  } = {}
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const headers = { ...options.headers };

    if (options.body) {
      headers['Content-Length'] = Buffer.byteLength(options.body).toString();
    }

    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const rawBuf = Buffer.concat(chunks);
          const textBody = rawBuf.toString('utf-8');

          resolve({
            status: res.statusCode || 200,
            headers: res.headers,
            text: async () => textBody,
            json: async () => JSON.parse(textBody),
          });
        });
      }
    );

    // Never let a hung upstream block extraction forever
    req.on('error', (err) => reject(err));
    req.setTimeout(options.timeoutMs ?? 20_000, () => {
      req.destroy(new Error(`Upstream timed out after ${options.timeoutMs ?? 20_000}ms`));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}
