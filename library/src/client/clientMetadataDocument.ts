import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * An OAuth Client ID Metadata Document (CIMD) as defined by
 * draft-ietf-oauth-client-id-metadata-document and adopted by MCP (SEP-991).
 * The document is hosted at an HTTPS URL which doubles as the OAuth client_id.
 */
export type ClientIdMetadataDocument = OAuthClientMetadata & {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
};

export interface ClientMetadataDocumentOptions {
  /**
   * The HTTPS URL at which this document is hosted.
   * Used verbatim as the OAuth client_id, so it must match the public URL exactly.
   */
  url: string;

  /**
   * Human-readable client name, shown on the authorization server's consent screen.
   */
  clientName: string;

  /**
   * Redirect URIs the authorization server should accept for this client.
   * For CLI/native clients, use LOOPBACK_REDIRECT_URIS: RFC 8252 requires
   * authorization servers to accept any port on loopback redirects, so the
   * URIs are listed without ports.
   */
  redirectUris: string[];

  /**
   * URL of the client's home page, shown on consent screens.
   */
  clientUri?: string;

  /**
   * URL of the client's logo, shown on consent screens.
   */
  logoUri?: string;

  /**
   * Space-separated scopes the client intends to request.
   */
  scope?: string;

  /**
   * OAuth grant types the client uses. Defaults to authorization_code + refresh_token.
   */
  grantTypes?: string[];

  /**
   * OAuth response types the client uses. Defaults to ["code"].
   */
  responseTypes?: string[];
}

/**
 * Portless loopback redirect URIs for CLI/native clients, matching the path
 * used by CLIAuthProvider's local callback server. Authorization servers
 * following RFC 8252 accept these regardless of the port the client binds.
 */
export const LOOPBACK_REDIRECT_URIS = ["http://localhost/callback", "http://127.0.0.1/callback"];

/**
 * Validates that a URL is usable as a CIMD client_id: HTTPS scheme, a non-root
 * path component, no fragment, and no embedded credentials.
 * Throws a descriptive error if the URL is invalid.
 */
export const assertValidClientMetadataUrl = (value: string): void => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Client metadata URL must be a valid URL, got: ${value}`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`Client metadata URL must use the https scheme, got: ${value}`);
  }
  if (url.pathname === "/") {
    throw new Error(`Client metadata URL must contain a path component, got: ${value}`);
  }
  if (url.hash) {
    throw new Error(`Client metadata URL must not contain a fragment, got: ${value}`);
  }
  if (url.username || url.password) {
    throw new Error(`Client metadata URL must not contain credentials, got: ${value}`);
  }
};

/**
 * Builds a spec-compliant Client ID Metadata Document. The document's
 * client_id is derived from the hosting URL, guaranteeing the exact-match
 * requirement authorization servers validate when fetching the document.
 *
 * token_endpoint_auth_method is always "none": CIMD clients are public
 * clients using PKCE — there is no registration exchange in which an
 * authorization server could issue a secret.
 */
export const buildClientMetadataDocument = (options: ClientMetadataDocumentOptions): ClientIdMetadataDocument => {
  assertValidClientMetadataUrl(options.url);
  if (options.redirectUris.length === 0) {
    throw new Error("Client metadata document requires at least one redirect URI");
  }
  return {
    client_id: options.url,
    client_name: options.clientName,
    redirect_uris: options.redirectUris,
    grant_types: options.grantTypes ?? ["authorization_code", "refresh_token"],
    response_types: options.responseTypes ?? ["code"],
    token_endpoint_auth_method: "none",
    ...(options.clientUri && { client_uri: options.clientUri }),
    ...(options.logoUri && { logo_uri: options.logoUri }),
    ...(options.scope && { scope: options.scope }),
  };
};
