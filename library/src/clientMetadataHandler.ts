import type { RequestHandler } from "express";
import { buildClientMetadataDocument, type ClientMetadataDocumentOptions } from "./client/clientMetadataDocument.js";

export interface ClientMetadataHandlerOptions extends ClientMetadataDocumentOptions {
  /**
   * Value for the Cache-Control max-age directive, in seconds.
   * Authorization servers cache CIMD documents per HTTP caching semantics,
   * so this controls how quickly metadata changes propagate. Defaults to 3600.
   */
  cacheMaxAgeSeconds?: number;
}

/**
 * Express handler that serves an OAuth Client ID Metadata Document (CIMD).
 *
 * Mount this at the exact path of the configured `url` so the served
 * document's client_id matches the URL authorization servers fetch:
 *
 * ```ts
 * app.get(
 *   "/oauth/client-metadata.json",
 *   clientMetadataHandler({
 *     url: "https://myagent.example.com/oauth/client-metadata.json",
 *     clientName: "My Agent",
 *     redirectUris: ["https://myagent.example.com/oauth/callback"],
 *   })
 * );
 * ```
 *
 * The document is built (and validated) once at setup time, so configuration
 * errors fail at startup rather than when an authorization server fetches it.
 */
export const clientMetadataHandler = (options: ClientMetadataHandlerOptions): RequestHandler => {
  const document = buildClientMetadataDocument(options);
  const maxAge = options.cacheMaxAgeSeconds ?? 3600;
  return (_req, res) => {
    res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
    res.json(document);
  };
};
