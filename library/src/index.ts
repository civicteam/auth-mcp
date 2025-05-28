import { Router } from "express";
import type { Request, RequestHandler } from "express";
import { McpServerAuth } from "./McpServerAuth.js";
import type { CivicAuthOptions, ExtendedAuthInfo } from "./types.js";

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
 *
 * @param options Configuration options
 * @returns Express middleware
 */
export async function auth<TAuthInfo extends ExtendedAuthInfo>(
  options: CivicAuthOptions<TAuthInfo, Request> = {}
): Promise<RequestHandler> {
  console.log(`Civic Auth MCP middleware initialized with options: ${JSON.stringify(options)}`);

  // Initialize the core auth functionality
  const mcpServerAuth = await McpServerAuth.init<TAuthInfo, Request>(options);

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

  // Token validation middleware
  router.use(async (req, res, next) => {
    console.log(`Received request: ${req.method} ${req.path}`);
    // Skip auth for metadata endpoints
    if (req.path === "/.well-known/oauth-protected-resource") {
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
      if (error instanceof Error) {
        if (error.message === "Authentication failed") {
          return res.status(401).json({
            error: "unauthorized",
            error_description: error.message,
          });
        }
        if (error.message === "Token validation failed") {
          return res.status(401).json({
            error: "invalid_token",
            error_description: error.message,
          });
        }
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
