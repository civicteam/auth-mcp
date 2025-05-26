import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { CivicAuthProvider, type CivicAuthProviderOptions } from "./CivicAuthProvider.js";

/**
 * Configuration options for TokenAuthProvider
 */
export interface TokenAuthProviderOptions extends CivicAuthProviderOptions {
  /**
   * OAuth tokens to use for authentication
   */
  tokens: OAuthTokens;
}

/**
 * Authentication provider for pre-obtained tokens.
 * Use this when you already have access tokens from an external OAuth flow
 * and want to use them directly with the MCP client.
 */
export class TokenAuthProvider extends CivicAuthProvider {
  /**
   * Create a new TokenAuthProvider
   * @param tokenOrOptions - Either a token string or full options object
   */
  constructor(tokenOrOptions: string | TokenAuthProviderOptions) {
    // Handle simple string constructor for convenience
    const options: TokenAuthProviderOptions =
      typeof tokenOrOptions === "string"
        ? { tokens: { access_token: tokenOrOptions, token_type: "Bearer" } }
        : tokenOrOptions;

    super(options);
    this.storedTokens = options.tokens;
  }

  get redirectUrl(): string | URL {
    // No redirect URL needed for token-based auth
    return "";
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [],
    };
  }

  clientInformation(): OAuthClientInformation | undefined {
    return {
      client_id: "token-client",
    };
  }

  saveTokens(tokens: OAuthTokens): void {
    this.storedTokens = tokens;
  }

  redirectToAuthorization(_authorizationUrl: URL): void {
    // No-op - tokens are already available
  }

  saveCodeVerifier(_codeVerifier: string): void {
    // No-op for token-based auth
  }

  codeVerifier(): string {
    // Return empty string as no code verifier is needed for token-based auth
    return "";
  }
}
