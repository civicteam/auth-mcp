import { Router } from "express";
import type { RequestHandler } from "express";
import { McpServerAuth } from "./McpServerAuth.js";
import type { CivicAuthOptions } from "./types.js";

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
export async function auth(options: CivicAuthOptions = {}): Promise<RequestHandler> {
  console.log(`Civic Auth MCP middleware initialized with options: ${JSON.stringify(options)}`);
  
  // Initialize the core auth functionality
  const mcpServerAuth = await McpServerAuth.init(options);
  
  // Create router
  const router = Router();
  
  // Expose OAuth Protected Resource Metadata
  // This tells MCP clients where to authenticate
  router.get("/.well-known/oauth-protected-resource", (req, res) => {
    const issuerUrl = options.issuerUrl || `${req.protocol}://${req.get('host')}`;
    const issuerUrlString = typeof issuerUrl === 'string' ? issuerUrl : issuerUrl.toString();
    const metadata = mcpServerAuth.getProtectedResourceMetadata(issuerUrlString);
    res.json(metadata);
  });
  
  // Token validation middleware
  router.use(async (req, res, next) => {
    console.log(`Received request: ${req.method} ${req.path}`);
    // Skip auth for metadata endpoints
    if (req.path === '/.well-known/oauth-protected-resource') {
      return next();
    }
    
    // Extract bearer token
    const token = McpServerAuth.extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ 
        error: 'unauthorized',
        error_description: 'Missing or invalid authorization header' 
      });
    }
    
    // Verify token
    const authInfo = await mcpServerAuth.verifyToken(token);
    if (!authInfo) {
      return res.status(401).json({ 
        error: 'invalid_token',
        error_description: 'Token validation failed' 
      });
    }
    
    // Attach to request for downstream use
    (req as any).auth = authInfo;
    console.log("Got auth info:", authInfo);
    
    next();
  });
  
  return router;
}