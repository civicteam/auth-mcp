import { createRemoteJWKSet, jwtVerify } from "jose";
import { DEFAULT_WELLKNOWN_URL } from "./constants.js";
import type { CivicAuthOptions, OIDCWellKnownConfiguration, ExtendedAuthInfo } from "./types.js";

/**
 * Core authentication functionality that can be used with any framework
 */
export class McpServerAuth {
  private oidcConfig: OIDCWellKnownConfiguration;
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private options: CivicAuthOptions;

  private constructor(
    oidcConfig: OIDCWellKnownConfiguration, 
    options: CivicAuthOptions = {}
  ) {
    this.oidcConfig = oidcConfig;
    this.options = options;
    this.jwks = createRemoteJWKSet(new URL(oidcConfig.jwks_uri));
  }

  /**
   * Initialize the auth core by fetching OIDC configuration
   */
  static async init(options: CivicAuthOptions = {}): Promise<McpServerAuth> {
    const wellKnownUrl = options.wellKnownUrl || DEFAULT_WELLKNOWN_URL;
    console.log(`Fetching Civic Auth OIDC configuration from ${wellKnownUrl}`);
    
    const response = await fetch(wellKnownUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Civic Auth configuration: ${response.statusText}`);
    }
    
    const oidcConfig = await response.json() as OIDCWellKnownConfiguration;
    return new McpServerAuth(oidcConfig, options);
  }

  /**
   * Get the OAuth Protected Resource metadata
   * @param issuerUrl The issuer URL of the resource server (e.g., https://my-server.com)
   */
  getProtectedResourceMetadata(issuerUrl: string) {
    return {
      resource: issuerUrl,
      authorization_servers: [this.oidcConfig.issuer],
      scopes_supported: this.options.scopesSupported || ['openid', 'profile', 'email'],
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://docs.civic.com',
      resource_policy_uri: 'https://www.civic.com/privacy-policy'
    };
  }

  /**
   * Verify a bearer token and return auth info
   * @param token The JWT token to verify
   * @returns ExtendedAuthInfo if valid, null if invalid
   */
  async verifyToken(token: string): Promise<ExtendedAuthInfo | null> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.oidcConfig.issuer,
      });

      // Build auth info
      let authInfo: ExtendedAuthInfo = {
        token,
        clientId: (payload.client_id as string) || (payload.aud as string),
        scopes: payload.scope ? (payload.scope as string).split(' ') : [],
        expiresAt: payload.exp,
        extra: {
          sub: payload.sub as string,
        }
      };

      // Call onLogin if provided to enrich auth info
      if (this.options.onLogin) {
        authInfo = await this.options.onLogin(authInfo);
      }

      return authInfo;
    } catch (error) {
      console.error("Token verification failed:", error);
      return null;
    }
  }

  /**
   * Extract bearer token from authorization header
   * @param authHeader The Authorization header value
   * @returns The token if valid format, null otherwise
   */
  static extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Get the configured options
   */
  getOptions(): CivicAuthOptions {
    return this.options;
  }
}