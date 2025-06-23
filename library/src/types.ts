import type { IncomingMessage } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { JWTPayload } from "jose";

export interface CivicAuthOptions<
  TAuthInfo extends ExtendedAuthInfo,
  TRequest extends IncomingMessage = IncomingMessage,
> {
  /**
   * The URL to the auth server's well-known OIDC configuration
   * Defaults to https://auth.civic.com/oauth/.well-known/openid-configuration
   */
  wellKnownUrl?: string;

  /**
   * OAuth scopes to support
   * Defaults to ['openid', 'profile', 'email']
   */
  scopesSupported?: string[];

  /**
   * The issuer URL for the resource server
   * Defaults to the server's base URL
   */
  issuerUrl?: string | URL;

  /**
   * Base path for auth endpoints
   * Defaults to '/'
   */
  basePath?: string;

  /**
   * The MCP route to protect with authentication
   * Defaults to '/mcp'
   */
  mcpRoute?: string;

  /**
   * Optional callback to enrich the auth info with custom data
   * Called after successful token verification
   * @param authInfo The verified auth info from the token. Null if no token was provided.
   * @param request Optional request object that may contain headers or other data
   * @returns Enriched auth info with custom data
   */
  onLogin?: (authInfo: ExtendedAuthInfo | null, request?: TRequest) => Promise<TAuthInfo | null>;

  /**
   * Optional OAuth client ID / Tenant ID.
   * When set, the access token must include *either* a "client_id" field or "tid" field that matches it.
   */
  clientId?: string;

  /**
   * Whether to allow dynamic client registration by adding client ID as subdomain.
   * When true, the client ID will be added as a subdomain to the auth server URL.
   * When false (default), the auth server URL will be used as-is without subdomain prefixing.
   * Defaults to false.
   */
  allowDynamicClientRegistration?: boolean;

  /**
   * Enable legacy OAuth mode where MCP server acts as an OAuth server.
   * When true, the server will expose OAuth endpoints that proxy to the underlying auth server.
   * Defaults to true for backward compatibility.
   * @deprecated This mode is deprecated. Clients should authenticate directly with the auth server.
   */
  enableLegacyOAuth?: boolean;
}

export interface OIDCWellKnownConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  introspection_endpoint?: string;
  revocation_endpoint?: string;
  registration_endpoint?: string;
}

export interface ExtendedAuthInfo extends AuthInfo {
  extra?: {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };
}

/**
 * Custom error class for all authentication errors
 */
export class AuthenticationError extends Error {}

/**
 * Custom error class for JWT verification failures
 */
export class JWTVerificationError extends AuthenticationError {
  constructor(
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = "JWTVerificationError";
  }
}

export type AccessTokenPayload = JWTPayload & {
  client_id: string | undefined;
  tid: string | undefined;
};
