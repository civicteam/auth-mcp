import { beforeEach, describe, expect, it } from "vitest";
import { TokenAuthProvider } from "./TokenAuthProvider.js";

describe("TokenAuthProvider", () => {
  const mockTokens = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    id_token: "test-id-token",
    token_type: "Bearer" as const,
  };

  let provider: TokenAuthProvider;

  beforeEach(() => {
    provider = new TokenAuthProvider({ tokens: mockTokens });
  });

  describe("with string constructor", () => {
    it("should accept a token string directly", () => {
      const tokenProvider = new TokenAuthProvider("test-token-string");
      const tokens = tokenProvider.tokens();
      expect(tokens).toEqual({
        access_token: "test-token-string",
        token_type: "Bearer",
      });
    });
  });

  it("should return the provided tokens when tokens() is called", async () => {
    const tokens = provider.tokens();
    expect(tokens).toEqual(mockTokens);
  });

  it("should return client information", () => {
    const clientInfo = provider.clientInformation();
    expect(clientInfo).toEqual({ client_id: "token-client" });
  });

  it("should return client metadata", () => {
    const metadata = provider.clientMetadata;
    expect(metadata).toEqual({
      redirect_uris: [],
    });
  });

  it("should save tokens when saveTokens is called", () => {
    const newTokens = {
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      token_type: "Bearer" as const,
    };

    provider.saveTokens(newTokens);
    const tokens = provider.tokens();
    expect(tokens).toEqual(newTokens);
  });

  it("should handle code verifier operations", () => {
    // Should not throw for token-based auth
    expect(() => provider.saveCodeVerifier("test-verifier")).not.toThrow();
    expect(provider.codeVerifier()).toBe("");
  });

  it("should handle authorization redirect as no-op", () => {
    // Should not throw for token-based auth
    expect(() => provider.redirectToAuthorization(new URL("https://example.com"))).not.toThrow();
  });
});
