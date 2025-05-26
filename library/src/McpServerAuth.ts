import type { IncomingMessage } from "node:http";
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from "jose";
import { DEFAULT_WELLKNOWN_URL } from "./constants.js";
import type { CivicAuthOptions, ExtendedAuthInfo, OIDCWellKnownConfiguration } from "./types.js";

/**
 * Core authentication functionality that can be used with any framework
 */
export class McpServerAuth<TRequest extends IncomingMessage = IncomingMessage> {
  private oidcConfig: OIDCWellKnownConfiguration;
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private options: CivicAuthOptions<TRequest>;

  private constructor(oidcConfig: OIDCWellKnownConfiguration, options: CivicAuthOptions<TRequest> = {}) {
    this.oidcConfig = oidcConfig;
    this.options = options;
    this.jwks = createRemoteJWKSet(new URL(oidcConfig.jwks_uri));
  }

  /**
   * Initialize the auth core by fetching OIDC configuration
   */
  static async init<TRequest extends IncomingMessage = IncomingMessage>(
    options: CivicAuthOptions<TRequest> = {}
  ): Promise<McpServerAuth<TRequest>> {
    const wellKnownUrl = options.wellKnownUrl || DEFAULT_WELLKNOWN_URL;
    console.log(`Fetching Civic Auth OIDC configuration from ${wellKnownUrl}`);

    const response = await fetch(wellKnownUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Civic Auth configuration: ${response.statusText}`);
    }

    const oidcConfig = (await response.json()) as OIDCWellKnownConfiguration;
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
      scopes_supported: this.options.scopesSupported || ["openid", "profile", "email"],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://docs.civic.com",
      resource_policy_uri: "https://www.civic.com/privacy-policy",
    };
  }

  /**
   * Create auth info from a token (or null) and request
   * @param token The JWT token (can be null)
   * @param payload The JWT payload if token was already verified
   * @param request Optional request object to pass to onLogin callback
   * @returns ExtendedAuthInfo if successful, null otherwise
   */
  private async createAuthInfo(
    token: string | null,
    payload: JWTPayload | null,
    request?: TRequest
  ): Promise<ExtendedAuthInfo | null> {
    const inputAuthInfo: ExtendedAuthInfo | null =
      token && payload
        ? {
            token,
            clientId: (payload.client_id as string) || (payload.aud as string),
            scopes: payload.scope ? (payload.scope as string).split(" ") : [],
            expiresAt: payload.exp,
            extra: {
              sub: payload.sub as string,
            },
          }
        : null;

    if (!this.options.onLogin) return inputAuthInfo;

    // Call onLogin if provided - it can create or enrich auth info
    // If authInfo is null, onLogin might create it from request headers
    return this.options.onLogin(inputAuthInfo, request);
  }

  /**
   * Extract and verify bearer token from authorization header
   * @param authHeader The Authorization header value
   * @returns Object with token and payload if valid, throws if invalid token, returns null values if no token
   */
  private async extractBearerToken(authHeader: string | undefined): Promise<{
    token: string | null;
    payload: JWTPayload | null;
  }> {
    if (!authHeader?.startsWith("Bearer ")) {
      return { token: null, payload: null };
    }

    const token = authHeader.substring(7);

    // Verify the token - this will throw if invalid
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.oidcConfig.issuer,
    });

    return { token, payload };
  }

  /**
   * Handle a request by extracting and verifying the bearer token
   * @param request The request object
   * @returns ExtendedAuthInfo if valid
   * @throws Error if authentication fails
   */
  async handleRequest(request: TRequest): Promise<ExtendedAuthInfo> {
    const { token, payload } = await this.extractBearerToken(request.headers.authorization);

    // Try to create auth info (even with null token/payload, onLogin might handle it)
    const authInfo = await this.createAuthInfo(token, payload, request);

    if (!authInfo) throw new Error("Authentication failed");

    return authInfo;
  }
}
