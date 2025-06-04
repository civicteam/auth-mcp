import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * Interface for token persistence strategies
 */
export interface TokenPersistence {
  /**
   * Save tokens to persistence storage
   */
  saveTokens(tokens: OAuthTokens): Promise<void> | void;

  /**
   * Load tokens from persistence storage
   */
  loadTokens(): Promise<OAuthTokens | undefined> | OAuthTokens | undefined;

  /**
   * Clear stored tokens
   */
  clearTokens(): Promise<void> | void;
}
