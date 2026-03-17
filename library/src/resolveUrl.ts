import type { IncomingMessage } from "node:http";

export interface UrlResolutionOptions {
  /** Header to read the protocol from. Default: none (uses forceHttps or req.protocol) */
  protocolHeader?: string;
  /** Header to read the host from. Default: "host" (standard Host header) */
  hostHeader?: string;
  /** Force HTTPS regardless of headers. Default: false */
  forceHttps?: boolean;
}

/** Resolves protocol and host from request, respecting configured headers */
export function resolveBaseUrl(req: IncomingMessage, options: UrlResolutionOptions = {}): string {
  let protocol: string;
  if (options.forceHttps) {
    protocol = "https";
  } else if (options.protocolHeader) {
    const headerValue = req.headers?.[options.protocolHeader.toLowerCase()];
    protocol = (typeof headerValue === "string" ? headerValue : undefined) ?? ("protocol" in req ? (req as any).protocol : "http");
  } else {
    protocol = "protocol" in req ? (req as any).protocol : "http";
  }

  let host: string | undefined;
  if (options.hostHeader) {
    const headerValue = req.headers?.[options.hostHeader.toLowerCase()];
    host = typeof headerValue === "string" ? headerValue : undefined;
  }
  if (!host) {
    host = req.headers?.host ?? "localhost";
  }

  return `${protocol}://${host}`;
}
