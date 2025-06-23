import { Router } from "express";
import type { Request, RequestHandler } from "express";
import { McpServerAuth } from "./McpServerAuth.js";
import { DEFAULT_MCP_ROUTE } from "./constants";
import { OAuthProxyHandler } from "./legacy/OAuthProxyHandler.js";
import {
  LEGACY_GRANT_TYPES,
  LEGACY_OAUTH_PATHS,
  LEGACY_RESPONSE_TYPES,
  LEGACY_TOKEN_AUTH_METHODS,
} from "./legacy/constants.js";
import { AuthenticationError } from "./types.js";
import type { CivicAuthOptions, ExtendedAuthInfo, OIDCWellKnownConfiguration } from "./types.js";

export * from "./types.js";
export * from "./constants.js";
export * from "./client/index.js";
export { McpServerAuth } from "./McpServerAuth.js";

/**
 * Express middleware that configures an MCP server to use Civic Auth
 * as its authorization server.
 *
 * This middleware:
 * 1. Exposes /.well-known/oauth-protected-resource metadata
 * 2. Validates bearer tokens using Civic's JWKS
 * 3. Attaches user info to the request
 * 4. (Legacy) Optionally exposes OAuth server endpoints for backward compatibility
 *
 * @param options Configuration options
 * @returns Express middleware
 */
export async function auth<TAuthInfo extends ExtendedAuthInfo>(
  options: CivicAuthOptions<TAuthInfo, Request> = {}
): Promise<RequestHandler> {
  console.log(`Civic Auth MCP middleware initialized with options: ${JSON.stringify(options)}`);

  // Default to enabling legacy OAuth for backward compatibility
  const enableLegacyOAuth = options.enableLegacyOAuth ?? true;

  // Initialize the core auth functionality
  const mcpServerAuth = await McpServerAuth.init<TAuthInfo, Request>(options);

  const mcpRoute = options.mcpRoute ?? DEFAULT_MCP_ROUTE;

  // Get OIDC config for legacy mode
  // @ts-expect-error - Accessing protected property for legacy compatibility
  const oidcConfig = mcpServerAuth.oidcConfig as OIDCWellKnownConfiguration;

  // Initialize OAuth handler if legacy mode is enabled
  const oauthHandler = enableLegacyOAuth ? new OAuthProxyHandler(options, oidcConfig) : null;

  // Create router
  const router = Router();

  // Expose OAuth Protected Resource Metadata
  // This tells MCP clients where to authenticate
  router.get("/.well-known/oauth-protected-resource", (req, res) => {
    const issuerUrl = options.issuerUrl || `${req.protocol}://${req.get("host")}`;
    const issuerUrlString = typeof issuerUrl === "string" ? issuerUrl : issuerUrl.toString();
    const metadata = mcpServerAuth.getProtectedResourceMetadata(issuerUrlString);
    res.json(metadata);
  });

  // Legacy OAuth endpoints
  if (enableLegacyOAuth && oauthHandler) {
    // OAuth Authorization Server Metadata (legacy)
    router.get(LEGACY_OAUTH_PATHS.WELL_KNOWN, (req, res) => {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const metadata = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}${LEGACY_OAUTH_PATHS.AUTHORIZE}`,
        token_endpoint: `${baseUrl}${LEGACY_OAUTH_PATHS.TOKEN}`,
        registration_endpoint: oidcConfig.registration_endpoint
          ? `${baseUrl}${LEGACY_OAUTH_PATHS.REGISTER}`
          : undefined,
        scopes_supported: options.scopesSupported || oidcConfig.scopes_supported || [],
        response_types_supported: LEGACY_RESPONSE_TYPES,
        grant_types_supported: LEGACY_GRANT_TYPES,
        token_endpoint_auth_methods_supported: LEGACY_TOKEN_AUTH_METHODS,
        code_challenge_methods_supported: ["S256", "plain"],
      };
      res.json(metadata);
    });

    // Authorization endpoint
    router.get(LEGACY_OAUTH_PATHS.AUTHORIZE, async (req, res) => {
      await oauthHandler.handleAuthorize(req, res);
    });

    // OAuth callback
    router.get("/oauth/callback", async (req, res) => {
      await oauthHandler.handleCallback(req, res);
    });

    // Token endpoint
    router.post(LEGACY_OAUTH_PATHS.TOKEN, async (req, res) => {
      await oauthHandler.handleToken(req, res);
    });

    // Registration endpoint
    if (oidcConfig.registration_endpoint) {
      router.post(LEGACY_OAUTH_PATHS.REGISTER, async (req, res) => {
        await oauthHandler.handleRegistration(req, res);
      });
    }
  }

  // Token validation middleware - only apply to mcpRoute
  router.use(async (req, res, next) => {
    // Skip auth for metadata endpoints
    if (req.path === "/.well-known/oauth-protected-resource") {
      return next();
    }

    // Skip auth for legacy OAuth endpoints
    if (
      enableLegacyOAuth &&
      (req.path === LEGACY_OAUTH_PATHS.WELL_KNOWN ||
        req.path === LEGACY_OAUTH_PATHS.AUTHORIZE ||
        req.path === LEGACY_OAUTH_PATHS.TOKEN ||
        req.path === LEGACY_OAUTH_PATHS.REGISTER ||
        req.path === "/oauth/callback")
    ) {
      return next();
    }

    // Only protect routes that start with mcpRoute
    if (!req.path.startsWith(mcpRoute)) {
      return next();
    }

    // Handle request authentication
    try {
      const authInfo = await mcpServerAuth.handleRequest(req);

      // Attach to request for downstream use
      // Express allows extending the Request interface through declaration merging
      // @ts-expect-error - Adding auth property to request
      req.auth = authInfo;

      next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        // authentication errors e.g. jwt verification errors (expired, invalid signature, etc.) should return 401
        return res.status(401).json({
          error: "authentication_error",
          error_description: error.message,
        });
      }

      // Unknown error
      return res.status(500).json({
        error: "internal_error",
        error_description: "An unexpected error occurred",
      });
    }
  });

  return router;
}
