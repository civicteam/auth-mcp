import type { IncomingMessage, ServerResponse } from "node:http";
import type { CivicAuthOptions, ExtendedAuthInfo } from "../types.js";

/**
 * Configuration options for legacy OAuth mode
 */
export interface LegacyOAuthOptions<
  TAuthInfo extends ExtendedAuthInfo,
  TRequest extends IncomingMessage = IncomingMessage,
> extends CivicAuthOptions<TAuthInfo, TRequest> {
  /**
   * Base URL of the MCP server (used for constructing OAuth endpoints)
   * Required when enableLegacyOAuth is true
   */
  mcpServerUrl?: string;

  /**
   * Path for OAuth authorization endpoint
   * Defaults to '/authorize'
   */
  authorizePath?: string;

  /**
   * Path for OAuth token endpoint
   * Defaults to '/token'
   */
  tokenPath?: string;

  /**
   * Path for OAuth registration endpoint
   * Defaults to '/register'
   */
  registrationPath?: string;

  /**
   * State store for managing OAuth flow state between redirects
   * Defaults to in-memory store
   */
  stateStore?: StateStore;
}

/**
 * OAuth state information stored between authorization and callback
 */
export interface OAuthState {
  /**
   * Original redirect URI from the client
   */
  redirectUri: string;

  /**
   * Original state parameter from the client
   */
  clientState?: string;

  /**
   * PKCE code challenge from the client
   */
  codeChallenge?: string;

  /**
   * PKCE code challenge method
   */
  codeChallengeMethod?: string;

  /**
   * Timestamp when state was created
   */
  createdAt: number;

  /**
   * OAuth scopes requested
   */
  scope?: string;

  /**
   * Client ID making the request
   */
  clientId?: string;
}

/**
 * Interface for storing OAuth state between redirects
 */
export interface StateStore {
  /**
   * Store state data
   */
  set(key: string, state: OAuthState): Promise<void>;

  /**
   * Retrieve state data
   */
  get(key: string): Promise<OAuthState | null>;

  /**
   * Delete state data
   */
  delete(key: string): Promise<void>;

  /**
   * Clean up expired states
   */
  cleanup?(): Promise<void>;
}

/**
 * OAuth authorization request parameters
 */
export interface AuthorizationRequest {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  state?: string;
  scope?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

/**
 * OAuth token request parameters
 */
export interface TokenRequest {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  client_secret?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
}

/**
 * OAuth error response
 */
export interface OAuthErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
  state?: string;
}

/**
 * Handler function type for OAuth endpoints
 */
export type OAuthEndpointHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: URLSearchParams
) => Promise<void>;
