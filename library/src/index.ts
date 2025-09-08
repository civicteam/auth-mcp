import type { Request, RequestHandler } from "express";
import { Router } from "express";
import { DEFAULT_MCP_ROUTE } from "./constants";
import { LegacyOAuthRouter } from "./legacy/LegacyOAuthRouter.js";
import { McpServerAuth } from "./McpServerAuth.js";
import type { CivicAuthOptions, ExtendedAuthInfo, OIDCWellKnownConfiguration } from "./types.js";
import { AuthenticationError } from "./types.js";

export * from "./client/index.js";
export * from "./constants.js";
export { InMemoryStateStore } from "./legacy/StateStore.js";
export type { OAuthState, StateStore } from "./legacy/types.js";
export { McpServerAuth } from "./McpServerAuth.js";
export * from "./types.js";

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

  // Create router
  const router = Router();

  // Expose OAuth Protected Resource Metadata
  // This tells MCP clients where to authenticate
  // Handle all routes starting with /.well-known/oauth-protected-resource
  router.use("/.well-known/oauth-protected-resource", (req, res) => {
    const protocol = options.forceHttps ? "https" : req.protocol;
    const issuerUrl = options.issuerUrl || `${protocol}://${req.get("host")}`;
    const issuerUrlString = typeof issuerUrl === "string" ? issuerUrl : issuerUrl.toString();
    const metadata = mcpServerAuth.getProtectedResourceMetadata(issuerUrlString);
    res.json(metadata);
  });

  // Legacy OAuth endpoints
  if (enableLegacyOAuth) {
    const legacyOAuthRouter = new LegacyOAuthRouter(options, oidcConfig);
    router.use(legacyOAuthRouter.createRouter());
  }

  // Token validation middleware - only apply to mcpRoute
  const tokenValidationMiddleware: RequestHandler = async (req, res, next) => {
    // Skip auth for metadata endpoints
    if (req.path === "/.well-known/oauth-protected-resource") {
      return next();
    }

    // Skip auth for legacy OAuth endpoints
    if (enableLegacyOAuth && LegacyOAuthRouter.getOAuthPaths().includes(req.path)) {
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
        res.status(401).json({
          error: "authentication_error",
          error_description: error.message,
        });
        return;
      }

      // Unknown error
      res.status(500).json({
        error: "internal_error",
        error_description: "An unexpected error occurred",
      });
      return;
    }
  };

  router.use(tokenValidationMiddleware);

  return router;
}
