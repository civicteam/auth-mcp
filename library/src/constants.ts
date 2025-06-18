export const DEFAULT_WELLKNOWN_URL = "https://auth.civic.com/oauth/.well-known/openid-configuration";

/**
 * Default scope for OAuth authentication
 */
export const DEFAULT_SCOPES = ["openid", "profile", "email", "offline_access"];

/**
 * Default callback port for CLI authentication flow
 */
export const DEFAULT_CALLBACK_PORT = 8080;

// Default mcpRoute to '/mcp' if not specified
export const DEFAULT_MCP_ROUTE = "/mcp";

// This client ID is used when a client is not provided.
// It is registered on Civic Auth as a rate-limited public "sandbox" account.
// Note, this option is used only if the auth server is Civic
export const PUBLIC_CIVIC_CLIENT_ID = "12220cf4-1a9a-4964-8eb7-7c6d7d049f34";
