import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { TokenPersistence } from "./TokenPersistence.js";

/**
 * In-memory token persistence strategy
 * Tokens are stored in memory and lost when the process exits
 */
export class InMemoryTokenPersistence implements TokenPersistence {
  private tokens: OAuthTokens | undefined;

  saveTokens(tokens: OAuthTokens): void {
    this.tokens = tokens;
  }

  loadTokens(): OAuthTokens | undefined {
    return this.tokens;
  }

  clearTokens(): void {
    this.tokens = undefined;
  }
}
