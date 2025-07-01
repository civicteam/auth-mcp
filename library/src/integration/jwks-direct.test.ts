import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WELLKNOWN_URL } from "../constants.js";
import { McpServerAuth } from "../McpServerAuth.js";
import { generateTestSetup } from "../test-utils/jwt-test-helpers.js";

// Mock fetch globally
global.fetch = vi.fn();

describe("JWKS Direct Integration", () => {
  it("should authenticate with a real JWT using local JWKS", async () => {
    // Generate test setup with real keys and JWT
    const { jwks, jwt } = await generateTestSetup({
      clientId: "test-client",
      sub: "test-user-123",
      scope: "openid profile email",
      issuer: "https://auth.civic.com",
    });

    // Mock OIDC config fetch
    const mockOidcConfig = {
      issuer: "https://auth.civic.com",
      authorization_endpoint: "https://auth.civic.com/authorize",
      token_endpoint: "https://auth.civic.com/token",
      jwks_uri: "https://auth.civic.com/jwks", // This won't be used
      scopes_supported: ["openid", "profile", "email"],
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockOidcConfig,
    });

    // Initialize McpServerAuth with local JWKS
    const auth = await McpServerAuth.init({
      clientId: "test-client",
      jwks,
    });

    // Verify OIDC config was fetched
    expect(global.fetch).toHaveBeenCalledWith(DEFAULT_WELLKNOWN_URL);

    // Create mock request with the JWT
    const mockRequest = {
      headers: {
        authorization: `Bearer ${jwt}`,
      },
    } as any;

    // Handle the request
    const authInfo = await auth.handleRequest(mockRequest);

    // Verify the auth info
    expect(authInfo).toMatchObject({
      token: jwt,
      clientId: "test-client",
      scopes: ["openid", "profile", "email"],
      extra: {
        sub: "test-user-123",
      },
    });

    // Verify expiration is set correctly (should be far in the future)
    expect(authInfo.expiresAt).toBeGreaterThan(Date.now() / 1000 + 365 * 24 * 60 * 60); // More than 1 year
  });

  it("should fail authentication with invalid JWT signature", async () => {
    // Generate test setup
    const { jwks } = await generateTestSetup();

    // Create a JWT with a different key (simulating invalid signature)
    const { jwt: invalidJwt } = await generateTestSetup({
      clientId: "test-client",
      kid: "different-key", // Different key ID
    });

    // Mock OIDC config
    const mockOidcConfig = {
      issuer: "https://auth.civic.com",
      authorization_endpoint: "https://auth.civic.com/authorize",
      token_endpoint: "https://auth.civic.com/token",
      jwks_uri: "https://auth.civic.com/jwks",
      scopes_supported: ["openid", "profile", "email"],
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockOidcConfig,
    });

    // Initialize with local JWKS
    const auth = await McpServerAuth.init({
      clientId: "test-client",
      jwks,
    });

    // Create mock request with invalid JWT
    const mockRequest = {
      headers: {
        authorization: `Bearer ${invalidJwt}`,
      },
    } as any;

    // Should throw when handling request
    await expect(auth.handleRequest(mockRequest)).rejects.toThrow();
  });

  it("should work with custom issuer and local JWKS", async () => {
    const customIssuer = "https://custom.auth.example.com";

    // Generate test setup with custom issuer
    const { jwks, jwt } = await generateTestSetup({
      clientId: "custom-client",
      issuer: customIssuer,
    });

    // Mock OIDC config with custom issuer
    const mockOidcConfig = {
      issuer: customIssuer,
      authorization_endpoint: `${customIssuer}/authorize`,
      token_endpoint: `${customIssuer}/token`,
      jwks_uri: `${customIssuer}/jwks`,
      scopes_supported: ["openid", "profile", "email"],
    };

    const customWellKnownUrl = `${customIssuer}/.well-known/openid-configuration`;

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockOidcConfig,
    });

    // Initialize with custom URL and local JWKS
    const auth = await McpServerAuth.init({
      wellKnownUrl: customWellKnownUrl,
      clientId: "custom-client",
      jwks,
    });

    // Verify correct URL was fetched
    expect(global.fetch).toHaveBeenCalledWith(customWellKnownUrl);

    // Create mock request
    const mockRequest = {
      headers: {
        authorization: `Bearer ${jwt}`,
      },
    } as any;

    // Handle request
    const authInfo = await auth.handleRequest(mockRequest);

    expect(authInfo).toMatchObject({
      token: jwt,
      clientId: "custom-client",
    });
  });

  it("should skip remote JWKS fetch when using local JWKS", async () => {
    // Generate test setup with the public Civic client ID
    const { jwks, jwt } = await generateTestSetup({
      clientId: "12220cf4-1a9a-4964-8eb7-7c6d7d049f34", // PUBLIC_CIVIC_CLIENT_ID
    });

    // Mock OIDC config
    const mockOidcConfig = {
      issuer: "https://auth.civic.com",
      authorization_endpoint: "https://auth.civic.com/authorize",
      token_endpoint: "https://auth.civic.com/token",
      jwks_uri: "https://auth.civic.com/jwks", // This URL should NOT be fetched
      scopes_supported: ["openid", "profile", "email"],
    };

    let jwksUriFetched = false;

    (global.fetch as any).mockImplementation(async (url: string) => {
      if (url === mockOidcConfig.jwks_uri) {
        jwksUriFetched = true;
      }
      return {
        ok: true,
        json: async () => mockOidcConfig,
      };
    });

    // Initialize with local JWKS
    const auth = await McpServerAuth.init({ jwks });

    // Create mock request
    const mockRequest = {
      headers: {
        authorization: `Bearer ${jwt}`,
      },
    } as any;

    // Handle request
    await auth.handleRequest(mockRequest);

    // Verify JWKS URI was NOT fetched
    expect(jwksUriFetched).toBe(false);
  });
});
