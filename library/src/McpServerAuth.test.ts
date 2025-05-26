import { beforeEach, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";
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

  // Tests for private methods are removed since they are now tested through handleRequest

  describe("handleRequest", () => {
    // These tests cover the functionality of the now-private createAuthInfo and extractBearerToken methods
    it("should extract token and verify it successfully", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: "client123",
          scope: "openid profile",
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init();
      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
        },
      } as any;

      const authInfo = await auth.handleRequest(mockRequest);

      expect(authInfo).toEqual({
        token: "valid.jwt.token",
        clientId: "client123",
        scopes: ["openid", "profile"],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
        },
      });
    });

    it("should throw error when no authorization header and no onLogin", async () => {
      const auth = await McpServerAuth.init();
      const mockRequest = {
        headers: {},
      } as any;

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow('Authentication failed');
    });

    it("should throw error when token is invalid", async () => {
      const error = new Error("Invalid token");
      vi.mocked(jwtVerify).mockRejectedValue(error);

      const auth = await McpServerAuth.init();
      const mockRequest = {
        headers: {
          authorization: "Bearer invalid.jwt.token",
        },
      } as any;

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow(error);
    });

    it("should pass request to onLogin callback", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: "client123",
          scope: "openid",
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const onLoginCallback = vi.fn(async (authInfo, request) => {
        return {
          ...authInfo,
          extra: {
            ...authInfo.extra,
            customData: request?.headers?.['x-custom-header'],
          },
        };
      });

      const auth = await McpServerAuth.init({ onLogin: onLoginCallback });
      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
          'x-custom-header': 'custom-value',
        },
      } as any;

      const authInfo = await auth.handleRequest(mockRequest);

      expect(onLoginCallback).toHaveBeenCalledWith({
        token: "valid.jwt.token",
        clientId: "client123",
        scopes: ["openid"],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
        },
      }, mockRequest);

      expect(authInfo).toEqual({
        token: "valid.jwt.token",
        clientId: "client123",
        scopes: ["openid"],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
          customData: "custom-value",
        },
      });
    });
    
    it("should allow onLogin to handle missing token", async () => {
      const onLoginCallback = vi.fn(async (authInfo, request) => {
        // Create auth from API key when no bearer token
        const apiKey = request?.headers?.['x-api-key'];
        if (apiKey === 'valid-api-key') {
          return {
            token: '',
            clientId: 'api-client',
            scopes: ['api:access'],
            extra: {
              authType: 'api-key',
              apiKey
            }
          };
        }
        return null;
      }) as any;

      const auth = await McpServerAuth.init({ onLogin: onLoginCallback });
      const mockRequest = {
        headers: {
          'x-api-key': 'valid-api-key',
        },
      } as any;

      const result = await auth.handleRequest(mockRequest);

      expect(result).toEqual({
        token: '',
        clientId: 'api-client',
        scopes: ['api:access'],
        extra: {
          authType: 'api-key',
          apiKey: 'valid-api-key'
        }
      });
    });
    
    it("should throw error when onLogin returns null", async () => {
      const onLoginCallback = vi.fn(async () => null) as any;

      const auth = await McpServerAuth.init({ onLogin: onLoginCallback });
      const mockRequest = {
        headers: {},
      } as any;

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow('Authentication failed');
    });

    it("should handle missing scope claim in JWT", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          aud: "audience123", // Use aud instead of client_id
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init();
      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
        },
      } as any;

      const authInfo = await auth.handleRequest(mockRequest);

      expect(authInfo).toEqual({
        token: "valid.jwt.token",
        clientId: "audience123",
        scopes: [],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
        },
      });
    });

    it("should handle onLogin callback errors", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: "client123",
          scope: "openid",
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const onLoginCallback = vi.fn(async () => {
        throw new Error("Database connection failed");
      });

      const auth = await McpServerAuth.init({ onLogin: onLoginCallback });
      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
        },
      } as any;

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow("Database connection failed");
    });

    it("should handle non-Bearer authorization headers", async () => {
      const auth = await McpServerAuth.init();
      const mockRequest = {
        headers: {
          authorization: "Basic abc123xyz",
        },
      } as any;

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow('Authentication failed');
    });
  });
});