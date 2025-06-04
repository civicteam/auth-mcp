import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { InMemoryTokenPersistence, type TokenPersistence } from "./persistence/index.js";

export interface CivicAuthProviderOptions {
  /**
   * Client secret for OAuth flows that don't support PKCE.
   * Optional - only needed for auth servers that require client authentication.
   */
  clientSecret?: string;

  /**
   * Token persistence strategy to use for storing/retrieving tokens.
   * Defaults to in-memory persistence if not provided.
   */
  tokenPersistence?: TokenPersistence;
}

/**
 * Abstract base class for Civic auth providers
 */
export abstract class CivicAuthProvider implements OAuthClientProvider {
  protected clientSecret?: string;
  protected tokenPersistence: TokenPersistence;

  constructor(options: CivicAuthProviderOptions) {
    this.clientSecret = options.clientSecret;
    this.tokenPersistence = options.tokenPersistence ?? new InMemoryTokenPersistence();
  }

  abstract clientInformation(): OAuthClientInformation | Promise<OAuthClientInformation | undefined> | undefined;

  abstract get clientMetadata(): OAuthClientMetadata;

  abstract codeVerifier(): string | Promise<string>;

  abstract get redirectUrl(): string | URL;

  abstract saveCodeVerifier(codeVerifier: string): void;

  saveTokens(tokens: OAuthTokens): void | Promise<void> {
    return this.tokenPersistence.saveTokens(tokens);
  }

  /**
   * Returns the stored tokens
   */
  tokens(): OAuthTokens | undefined | Promise<OAuthTokens | undefined> {
    return this.tokenPersistence.loadTokens();
  }

  /**
   * Clears the stored tokens
   */
  clearTokens(): void | Promise<void> {
    return this.tokenPersistence.clearTokens();
  }

  abstract redirectToAuthorization(authorizationUrl: URL): void | Promise<void>;
}
