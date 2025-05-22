import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { RequestHandler } from "express";
import { Router } from "express";
import { createCivicOAuthProvider } from "../provider.js";
import { CivicAuthMiddlewareOptions } from "../types.js";

/**
 * Creates Express middleware for Civic authentication that does everything in one step:
 * 1. Creates OAuth provider with Civic's well-known configuration
 * 2. Adds mcpAuthRouter to handle OAuth endpoints (/auth/authorize, /auth/token, etc.)
 * 3. Adds requireBearerAuth middleware to enforce authentication on subsequent requests
 *
 * @param options - Configuration options for the middleware
 * @returns Express RequestHandler that can be used with app.use()
 */
export async function civicAuth(
	options: CivicAuthMiddlewareOptions,
): Promise<RequestHandler> {
	// Create the auth configuration
	const authOptions = await createCivicOAuthProvider(options);

	// Create the proxy provider that will handle OAuth flows
	const proxyProvider = new ProxyOAuthServerProvider(authOptions.proxy);

	// Create router to combine OAuth endpoints and auth enforcement
	const router = Router();

	// Set up OAuth endpoints (authorize, token, etc.)
	const routerConfig = {
		...authOptions.router,
		provider: proxyProvider,
		basePath: options.basePath || "/auth",
	};

	router.use(mcpAuthRouter(routerConfig));

	// Add bearer auth enforcement
	router.use(
		requireBearerAuth({
			provider: proxyProvider,
		}),
	);

	return router;
}
