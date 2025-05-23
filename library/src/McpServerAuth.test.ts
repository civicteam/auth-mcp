import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpServerAuth } from "./McpServerAuth.js";
import { DEFAULT_WELLKNOWN_URL } from "./constants.js";

// Mock fetch globally
global.fetch = vi.fn();

// Mock jose module
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mockJWKS"),
  jwtVerify: vi.fn(),
}));

describe("McpServerAuth", () => {
  const mockOidcConfig = {
    issuer: "https://auth.civic.com",
    authorization_endpoint: "https://auth.civic.com/authorize",
    token_endpoint: "https://auth.civic.com/token",
    jwks_uri: "https://auth.civic.com/jwks",
    scopes_supported: ["openid", "profile", "email"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful OIDC fetch
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockOidcConfig,
    });
  });

  describe("init", () => {
    it("should fetch OIDC configuration from default URL", async () => {
      const auth = await McpServerAuth.init();

      expect(global.fetch).toHaveBeenCalledWith(DEFAULT_WELLKNOWN_URL);
      expect(auth).toBeInstanceOf(McpServerAuth);
    });

    it("should fetch OIDC configuration from custom URL", async () => {
      const customUrl = "https://custom.auth.com/.well-known/openid-configuration";
      const auth = await McpServerAuth.init({ wellKnownUrl: customUrl });

      expect(global.fetch).toHaveBeenCalledWith(customUrl);
      expect(auth).toBeInstanceOf(McpServerAuth);
    });

    it("should throw error when fetch fails", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: "Not Found",
      });

      await expect(McpServerAuth.init()).rejects.toThrow(
        "Failed to fetch Civic Auth configuration: Not Found"
      );
    });
  });

  describe("getProtectedResourceMetadata", () => {
    it("should return correct metadata with default options", async () => {
      const auth = await McpServerAuth.init();
      const metadata = auth.getProtectedResourceMetadata("https://my-server.com");

      expect(metadata).toEqual({
        resource: "https://my-server.com",
        authorization_servers: ["https://auth.civic.com"],
        scopes_supported: ["openid", "profile", "email"],
        bearer_methods_supported: ["header"],
        resource_documentation: "https://docs.civic.com",
        resource_policy_uri: "https://www.civic.com/privacy-policy",
      });
    });

    it("should use custom scopes when provided", async () => {
      const auth = await McpServerAuth.init({
        scopesSupported: ["custom:read", "custom:write"],
      });
      const metadata = auth.getProtectedResourceMetadata("https://my-server.com");

      expect(metadata.scopes_supported).toEqual(["custom:read", "custom:write"]);
    });
  });

  describe("verifyToken", () => {
    it("should verify a valid token", async () => {
      // We need to mock the jose module at the top level
      const { jwtVerify } = await import("jose");
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: "client123",
          scope: "openid profile email",
          exp: 1234567890,
          email: "user@example.com",
          name: "Test User",
          picture: "https://example.com/picture.jpg",
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init();
      const authInfo = await auth.verifyToken("valid.jwt.token");

      expect(authInfo).toEqual({
        token: "valid.jwt.token",
        clientId: "client123",
        scopes: ["openid", "profile", "email"],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
          email: "user@example.com",
          name: "Test User",
          picture: "https://example.com/picture.jpg",
        },
      });
    });

    it("should return null for invalid token", async () => {
      const { jwtVerify } = await import("jose");
      vi.mocked(jwtVerify).mockRejectedValue(new Error("Invalid token"));

      const auth = await McpServerAuth.init();
      const authInfo = await auth.verifyToken("invalid.jwt.token");

      expect(authInfo).toBeNull();
    });

    it("should handle missing scope claim", async () => {
      const { jwtVerify } = await import("jose");
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          aud: "audience123", // Use aud instead of client_id
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init();
      const authInfo = await auth.verifyToken("valid.jwt.token");

      expect(authInfo).toEqual({
        token: "valid.jwt.token",
        clientId: "audience123",
        scopes: [],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
          email: undefined,
          name: undefined,
          picture: undefined,
        },
      });
    });
  });

  describe("extractBearerToken", () => {
    it("should extract token from valid Bearer header", () => {
      const token = McpServerAuth.extractBearerToken("Bearer abc123xyz");
      expect(token).toBe("abc123xyz");
    });

    it("should return null for missing header", () => {
      const token = McpServerAuth.extractBearerToken(undefined);
      expect(token).toBeNull();
    });

    it("should return null for non-Bearer header", () => {
      const token = McpServerAuth.extractBearerToken("Basic abc123xyz");
      expect(token).toBeNull();
    });

    it("should return null for malformed Bearer header", () => {
      const token = McpServerAuth.extractBearerToken("Bearer");
      expect(token).toBeNull();
    });
  });

  describe("getOptions", () => {
    it("should return the options passed during initialization", async () => {
      const options = {
        wellKnownUrl: "https://custom.auth.com/.well-known/openid-configuration",
        scopesSupported: ["custom:scope"],
      };
      
      const auth = await McpServerAuth.init(options);
      expect(auth.getOptions()).toEqual(options);
    });
  });
});