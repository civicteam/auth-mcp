import type { IncomingMessage } from "node:http";
import { createLocalJWKSet, createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import { CIVIC_BASE_ISSUER, DEFAULT_SCOPES, DEFAULT_WELLKNOWN_URL, PUBLIC_CIVIC_CLIENT_ID } from "./constants.js";
import {
  type AccessTokenPayload,
  AuthenticationError,
  type CivicAuthOptions,
  type ExtendedAuthInfo,
  JWTVerificationError,
  type OIDCWellKnownConfiguration,
} from "./types.js";

/**
 * Whether the configured auth server is Civic.
 * True when no wellKnownUrl is provided, or it is the default Civic URL.
 */
const isCivicAuthServer = <TAuthInfo extends ExtendedAuthInfo, TRequest extends IncomingMessage = IncomingMessage>(
  options: CivicAuthOptions<TAuthInfo, TRequest>
): boolean => !options.wellKnownUrl || options.wellKnownUrl === DEFAULT_WELLKNOWN_URL;

/**
 * Return the client ID that must be in the jwt (in either the tid or client_id field).
 * If a client id is explicitly specified by the config then use that.
 * If the auth server is civic, then we allow the public client id if none is specified.
 * Otherwise, return undefined, which means the jwt will accept any access token from the specified issuer
 * @param options
 */
const getExpectedClientId = <TAuthInfo extends ExtendedAuthInfo, TRequest extends IncomingMessage = IncomingMessage>(
  options: CivicAuthOptions<TAuthInfo, TRequest>
): string | undefined => {
  if (options.clientId) {
    return options.clientId;
  }

  if (isCivicAuthServer(options)) {
    return PUBLIC_CIVIC_CLIENT_ID;
  }

  return undefined;
};

/**
 * Build the set of token issuers to accept during verification.
 *
 * Always includes the discovered (advertised) issuer. When using Civic Auth,
 * the base Civic issuer is also accepted so that base-issuer tokens (e.g.
 * client_credentials and token-exchange output) and tenant-scoped tokens both
 * validate, while discovery continues to advertise the tenant-scoped issuer.
 * All Civic issuers share a single signing key, so relaxing the issuer pin does
 * not weaken signature verification.
 *
 * @param oidcIssuer The issuer advertised by the discovered OIDC configuration
 * @param options The auth options
 */
const getAcceptedIssuers = <TAuthInfo extends ExtendedAuthInfo, TRequest extends IncomingMessage = IncomingMessage>(
  oidcIssuer: string,
  options: CivicAuthOptions<TAuthInfo, TRequest>
): string[] => {
  const issuers = [oidcIssuer];
  if (isCivicAuthServer(options)) {
    issuers.push(CIVIC_BASE_ISSUER);
  }
  return [...new Set(issuers)];
};

/**
 * Get the auth server URL based on the options provided.
 * This adds tenant-specific information via the path if using Civic Auth and dynamic client registration is enabled.
 */
const getAuthServer = <TAuthInfo extends ExtendedAuthInfo, TRequest extends IncomingMessage = IncomingMessage>(
  options: CivicAuthOptions<TAuthInfo, TRequest>
): string => {
  // if the wellknown url is explicitly set to something other than Civic, just use that
  if (options.wellKnownUrl && options.wellKnownUrl !== DEFAULT_WELLKNOWN_URL) return options.wellKnownUrl;

  // If dynamic client registration is enabled, adapt the URL with client ID in the path
  if (options.allowDynamicClientRegistration) {
    const clientId = getExpectedClientId(options) ?? PUBLIC_CIVIC_CLIENT_ID;
    return DEFAULT_WELLKNOWN_URL.replace("/oauth/", `/oauth/${clientId}/`);
  }

  // Default behavior: use the URL as-is without modification
  return DEFAULT_WELLKNOWN_URL;
};

/**
 * Verify that the client_id or tid in the token matches the expected client ID.
 * Throws an error if it does not match.
 *
 * In a DCR environment we would expect the actual client id to be the dynamically created one,
 * but in that case the "tid" should refer to the tenant ID, which is the same as the "base"
 * client ID passed in the options.
 *
 * @param payload The JWT payload containing client_id or tid
 * @param expectedClientId The expected client ID to match against
 */
const verifyClientId = (payload: AccessTokenPayload, expectedClientId: string | undefined) => {
  if (!expectedClientId) {
    throw new AuthenticationError("Client ID verification is enabled but no expected client ID was provided");
  }

  // Check if either the client_id or tid matches the expected client ID
  // At least one of them must match
  const clientIdMatches = payload.client_id === expectedClientId;
  const tidMatches = payload.tid === expectedClientId;

  if (!clientIdMatches && !tidMatches) {
    throw new AuthenticationError(`Invalid client_id or tid in token. Expected: ${expectedClientId}`);
  }
};

/**
 * Core authentication functionality that can be used with any framework
 */
export class McpServerAuth<TAuthInfo extends ExtendedAuthInfo, TRequest extends IncomingMessage = IncomingMessage> {
  protected oidcConfig: OIDCWellKnownConfiguration;
  protected jwks: ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>;
  protected options: CivicAuthOptions<TAuthInfo, TRequest>;
  protected acceptedIssuers: string[];

  protected constructor(oidcConfig: OIDCWellKnownConfiguration, options: CivicAuthOptions<TAuthInfo, TRequest>) {
    this.oidcConfig = oidcConfig;
    this.options = options;
    this.acceptedIssuers = getAcceptedIssuers(oidcConfig.issuer, options);

    // Use local JWKS if provided, otherwise fetch from remote
    if (options.jwks) {
      this.jwks = createLocalJWKSet(options.jwks);
    } else {
      this.jwks = createRemoteJWKSet(new URL(oidcConfig.jwks_uri));
    }
  }

  /**
   * Initialize the auth core by fetching OIDC configuration
   */
  static async init<TAuthInfo extends ExtendedAuthInfo, TRequest extends IncomingMessage = IncomingMessage>(
    options: CivicAuthOptions<TAuthInfo, TRequest> = {}
  ): Promise<McpServerAuth<TAuthInfo, TRequest>> {
    const wellKnownUrl = getAuthServer(options);
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
   * @param resourceUrl The resource URL of the protected resource (e.g., https://my-server.com/mcp)
   */
  getProtectedResourceMetadata(resourceUrl: string) {
    return {
      resource: resourceUrl,
      authorization_servers: [this.oidcConfig.issuer],
      scopes_supported: this.options.scopesSupported || DEFAULT_SCOPES,
      bearer_methods_supported: ["header"],
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
  ): Promise<TAuthInfo | null> {
    const inputAuthInfo: ExtendedAuthInfo | null =
      token && payload
        ? {
            token,
            clientId: (payload.client_id as string) || (payload.aud as string),
            tenantId: payload.tid as string | undefined,
            scopes: payload.scope ? (payload.scope as string).split(" ") : [],
            expiresAt: payload.exp,
            extra: {
              ...payload,
            },
          }
        : null;

    if (!this.options.onLogin) return inputAuthInfo as TAuthInfo;

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
    payload: AccessTokenPayload | null;
  }> {
    if (!authHeader?.startsWith("Bearer ")) {
      return { token: null, payload: null };
    }

    const token = authHeader.substring(7);

    try {
      // When an issuerValidator is provided it fully owns issuer validation, so
      // we skip jose's built-in issuer pin and apply the predicate afterwards.
      // Otherwise we pin to the accepted issuer set (discovered + base Civic).
      const { issuerValidator } = this.options;
      const { payload } = await jwtVerify<AccessTokenPayload>(
        token,
        this.jwks,
        issuerValidator ? {} : { issuer: this.acceptedIssuers }
      );

      if (issuerValidator && !issuerValidator(payload.iss)) {
        throw new AuthenticationError(`Invalid "iss" claim value: ${payload.iss}`);
      }

      if (!(this.options.disableClientIdVerification ?? false)) {
        verifyClientId(payload, getExpectedClientId(this.options));
      }

      return { token, payload };
    } catch (error) {
      // Wrap jose errors in our custom error class, so that we can catch them and return 401
      throw new JWTVerificationError(
        error instanceof Error ? error.message : "JWT verification failed",
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Handle a request by extracting and verifying the bearer token
   * @param request The request object
   * @returns ExtendedAuthInfo if valid
   * @throws Error if authentication fails
   */
  async handleRequest(request: TRequest): Promise<TAuthInfo> {
    const { token, payload } = await this.extractBearerToken(request.headers.authorization);

    // Try to create auth info (even with null token/payload, onLogin might handle it)
    const authInfo = await this.createAuthInfo(token, payload, request);

    if (!authInfo) throw new AuthenticationError("Authentication failed");

    return authInfo;
  }
}
