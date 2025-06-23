/**
 * Default paths for legacy OAuth endpoints
 */
export const LEGACY_OAUTH_PATHS = {
  WELL_KNOWN: "/.well-known/oauth-authorization-server",
  AUTHORIZE: "/authorize",
  TOKEN: "/token",
  REGISTER: "/register",
} as const;

/**
 * OAuth error codes
 */
export const OAUTH_ERRORS = {
  INVALID_REQUEST: "invalid_request",
  UNAUTHORIZED_CLIENT: "unauthorized_client",
  ACCESS_DENIED: "access_denied",
  UNSUPPORTED_RESPONSE_TYPE: "unsupported_response_type",
  INVALID_SCOPE: "invalid_scope",
  SERVER_ERROR: "server_error",
  TEMPORARILY_UNAVAILABLE: "temporarily_unavailable",
  INVALID_CLIENT: "invalid_client",
  INVALID_GRANT: "invalid_grant",
  UNSUPPORTED_GRANT_TYPE: "unsupported_grant_type",
} as const;

/**
 * State expiration time in milliseconds (10 minutes)
 */
export const STATE_EXPIRATION_MS = 10 * 60 * 1000;

/**
 * Supported grant types for legacy mode
 */
export const LEGACY_GRANT_TYPES = ["authorization_code", "refresh_token"] as const;

/**
 * Supported response types for legacy mode
 */
export const LEGACY_RESPONSE_TYPES = ["code"] as const;

/**
 * Token endpoint auth methods supported
 */
export const LEGACY_TOKEN_AUTH_METHODS = ["client_secret_post", "client_secret_basic", "none"] as const;
