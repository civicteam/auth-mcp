import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { assertValidClientMetadataUrl } from "../clientMetadataDocument.js";
import { InMemoryTokenPersistence, type TokenPersistence } from "./persistence/index.js";

export interface CivicAuthProviderOptions {
  /**
   * A pre-registered OAuth client ID. Takes precedence over clientMetadataUrl
   * when both are provided, matching the MCP client registration priority order.
   */
  clientId?: string;

  /**
   * HTTPS URL of a hosted Client ID Metadata Document (CIMD, SEP-991).
   * When the authorization server advertises client_id_metadata_document_supported,
   * this URL is used directly as the client_id — no registration required.
   * Otherwise the flow falls back to Dynamic Client Registration.
   */
  clientMetadataUrl?: string;

  /**
   * Human-readable client name used in Dynamic Client Registration requests.
   * Defaults to the clientId when one is provided.
   */
  clientName?: string;

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
  protected clientId?: string;
  protected clientName?: string;
  protected clientSecret?: string;
  protected tokenPersistence: TokenPersistence;
  readonly clientMetadataUrl?: string;
  private savedClientInformation?: OAuthClientInformation;

  constructor(options: CivicAuthProviderOptions) {
    if (options.clientMetadataUrl) {
      assertValidClientMetadataUrl(options.clientMetadataUrl);
    }
    this.clientId = options.clientId;
    this.clientMetadataUrl = options.clientMetadataUrl;
    this.clientName = options.clientName;
    this.clientSecret = options.clientSecret;
    this.tokenPersistence = options.tokenPersistence ?? new InMemoryTokenPersistence();
  }

  /**
   * Returns the pre-registered client information if a clientId was configured.
   * Without one, registration is delegated to the SDK, which uses the
   * clientMetadataUrl as client_id when the authorization server supports
   * CIMD, or falls back to Dynamic Client Registration. Either result
   * arrives via saveClientInformation.
   */
  clientInformation(): OAuthClientInformation | Promise<OAuthClientInformation | undefined> | undefined {
    if (!this.clientId) {
      return this.savedClientInformation;
    }

    const info: OAuthClientInformation = {
      client_id: this.clientId,
    };

    // Include client_secret if provided (for non-PKCE auth servers)
    if (this.clientSecret) {
      info.client_secret = this.clientSecret;
    }

    return info;
  }

  saveClientInformation(clientInformation: OAuthClientInformation): void {
    this.savedClientInformation = clientInformation;
  }

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
