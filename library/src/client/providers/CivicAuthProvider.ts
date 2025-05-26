import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export interface CivicAuthProviderOptions {
  /**
   * Client secret for OAuth flows that don't support PKCE.
   * Optional - only needed for auth servers that require client authentication.
   */
  clientSecret?: string;
}

/**
 * Abstract base class for Civic auth providers
 */
export abstract class CivicAuthProvider implements OAuthClientProvider {
  protected clientSecret?: string;
  protected storedTokens: OAuthTokens | undefined;

  constructor(options: CivicAuthProviderOptions) {
    this.clientSecret = options.clientSecret;
  }

  abstract clientInformation(): OAuthClientInformation | Promise<OAuthClientInformation | undefined> | undefined;

  abstract get clientMetadata(): OAuthClientMetadata;

  abstract codeVerifier(): string | Promise<string>;

  abstract get redirectUrl(): string | URL;

  abstract saveCodeVerifier(codeVerifier: string): void;

  abstract saveTokens(tokens: OAuthTokens): void;

  /**
   * Returns the stored tokens
   */
  tokens(): OAuthTokens | undefined {
    return this.storedTokens;
  }

  abstract redirectToAuthorization(authorizationUrl: URL): void | Promise<void>;
}
