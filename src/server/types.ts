import type { ProxyOptions } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import type { AuthRouterOptions } from "@modelcontextprotocol/sdk/server/auth/router.js";

/**
 * Authentication options that can be used with MCP servers
 */
export type AuthOptions = {
	proxy: ProxyOptions;
	router: Omit<AuthRouterOptions, "provider">;
};

/**
 * OIDC Well-Known Configuration from the discovery endpoint
 */
export interface OIDCWellKnownConfiguration {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	revocation_endpoint?: string;
	registration_endpoint?: string;
	jwks_uri: string;
	response_types_supported?: string[];
	grant_types_supported?: string[];
	scopes_supported?: string[];
	token_endpoint_auth_methods_supported?: string[];
}

/**
 * Configuration options for a Civic OAuth provider
 */
export interface CivicOAuthProviderOptions {
	/**
	 * Redirect URIs for OAuth callbacks
	 */
	redirectUris: string[];

	/**
	 * Client ID for the OAuth client
	 */
	clientId?: string;

	/**
	 * Client secret for the OAuth client (optional for public clients)
	 */
	clientSecret?: string;

	/**
	 * The URL of the OAuth issuer (defaults to Civic Auth)
	 */
	issuerUrl?: URL;

	/**
	 * The URL to the well-known OIDC configuration
	 */
	wellKnownUrl?: string;

	/**
	 * OAuth scope to request (defaults to "openid profile email")
	 */
	scope?: string;

	/**
	 * URL to documentation for the service
	 */
	serviceDocumentationUrl?: URL;
}

/**
 * Configuration options for the Express civicAuth middleware
 */
export interface CivicAuthMiddlewareOptions extends CivicOAuthProviderOptions {
	/**
	 * Base path for all auth-related endpoints (defaults to "/auth")
	 */
	basePath?: string;
}

/**
 * Configuration options for the Civic Auth Proxy
 */
export interface CivicAuthProxyOptions extends CivicOAuthProviderOptions {
	/**
	 * Base path for all auth-related endpoints (defaults to "/auth")
	 */
	basePath?: string;
}
