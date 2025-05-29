import type { IncomingMessage } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export interface CivicAuthOptions<
  TAuthInfo extends ExtendedAuthInfo,
  TRequest extends IncomingMessage = IncomingMessage,
> {
  /**
   * The URL to Civic's well-known OIDC configuration
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
