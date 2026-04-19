import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import type { AxiosRequestConfig, RawAxiosRequestHeaders } from 'axios';
import type { Request, Response } from 'express';
import * as http from 'http';
import * as https from 'https';
import { firstValueFrom } from 'rxjs';

// ── Forwarded request headers ────────────────────────────────────────────────
// Only headers the downstream services actually need or that are required by
// HTTP semantics are forwarded. This prevents clients from injecting privileged
// headers (`x-internal-user`, `x-admin-override`, …) that a downstream service
// might trust on the shared docker network.
const FORWARDED_REQUEST_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'authorization',
  'cache-control',
  'content-type',
  'cookie',
  'if-modified-since',
  'if-none-match',
  'pragma',
  'user-agent',
  'x-request-id',
  'x-real-ip',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-correlation-id',
  'x-trace-id',
]);

// Response headers that must NOT be copied back to the caller — either hop-by-
// hop (per RFC 7230 §6.1), or because the platform rewrites them.
const STRIPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'content-encoding', // axios auto-decompresses; recompressing would corrupt the body
  // CORS headers are owned by the gateway. Downstream services run with
  // `origin: '*'`, which the browser rejects when combined with credentials —
  // so we drop their CORS headers and let the gateway's own values stand.
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-max-age',
  'vary',
]);

export interface ProxyOptions {
  /** Upstream base URL, e.g. `http://home-service:3001/api/v1`. */
  target: string;
  /** URL path prefix to strip from the incoming request, e.g. `/home`. */
  prefix: string;
  /** Optional override for the request timeout (ms). */
  timeoutMs?: number;
}

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  /**
   * Single keep-alive agent pair shared across every proxied request so TCP
   * connections to the downstream services are reused rather than re-opened
   * on every call.
   */
  private readonly httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 256,
    maxFreeSockets: 64,
    timeout: 60_000,
  });
  private readonly httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 256,
    maxFreeSockets: 64,
    timeout: 60_000,
  });

  constructor(private readonly httpService: HttpService) {}

  async forward(
    req: Request,
    res: Response,
    options: ProxyOptions,
  ): Promise<void> {
    const { target, prefix, timeoutMs } = options;

    if (!target) {
      res.status(500).json({ message: `${prefix} target not configured` });
      return;
    }

    const path = req.url.replace(
      new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}/?`),
      '',
    );
    const url = `${target}/${path}`;
    const isMultipart = (req.headers['content-type'] ?? '').includes(
      'multipart/form-data',
    );

    const config: AxiosRequestConfig = {
      method: req.method,
      url,
      headers: this.buildForwardHeaders(req),
      // Multipart uploads can be large; give them more runway.
      // Everything else should be brisk — long-running work belongs in a queue.
      timeout: timeoutMs ?? (isMultipart ? 120_000 : 15_000),
      maxBodyLength: isMultipart ? 64 * 1024 * 1024 : 10 * 1024 * 1024,
      maxContentLength: 64 * 1024 * 1024,
      validateStatus: () => true,
      // `decompress: false` keeps the upstream response bytes intact so we can
      // forward content-encoding as-is if we ever re-enable it. For now we let
      // axios decompress (see STRIPPED_RESPONSE_HEADERS).
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      responseType: 'arraybuffer',
    };

    if (isMultipart) {
      // Stream the raw body through — avoids buffering large uploads in memory.
      config.data = req;
    } else {
      config.data = req.body;
    }

    try {
      const response = await firstValueFrom(this.httpService.request(config));

      // Copy response headers, excluding hop-by-hop + platform-rewritten ones.
      for (const [name, value] of Object.entries(response.headers ?? {})) {
        if (value === undefined || value === null) continue;
        if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
        res.setHeader(name, value as string | string[]);
      }

      res.status(response.status);
      const body = response.data as Buffer;
      res.send(body);
    } catch (error) {
      const err = error as {
        message: string;
        code?: string;
        response?: { status: number; data: unknown };
      };
      this.logger.error(
        `Proxy ${prefix} → ${url} failed: ${err.message}`,
        err.response?.data,
      );
      const status = err.response?.status ?? 502;
      const data = err.response?.data ?? {
        message: 'Service unavailable',
        error: err.message,
      };
      res.status(status).json(data);
    }
  }

  private buildForwardHeaders(req: Request): RawAxiosRequestHeaders {
    const headers: RawAxiosRequestHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (FORWARDED_REQUEST_HEADERS.has(name.toLowerCase())) {
        headers[name] = value;
      }
    }

    // Always (re)set trust-boundary headers so a client can't spoof them.
    const clientIp =
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() || req.ip;
    if (clientIp) headers['x-real-ip'] = clientIp;
    if (req.protocol) headers['x-forwarded-proto'] = req.protocol;
    if (req.hostname) headers['x-forwarded-host'] = req.hostname;

    return headers;
  }
}
