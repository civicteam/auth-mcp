import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SCOPES, DEFAULT_WELLKNOWN_URL, PUBLIC_CIVIC_CLIENT_ID } from "./constants.js";
import { McpServerAuth } from "./McpServerAuth.js";
import { JWTVerificationError } from "./types.js";

// Mock fetch globally
global.fetch = vi.fn();

// Mock jose module
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mockJWKS"),
  createLocalJWKSet: vi.fn(() => "mockLocalJWKS"),
  jwtVerify: vi.fn(),
}));

describe("McpServerAuth", () => {
  const mockOidcConfig = {
    issuer: "https://auth.civic.com",
    authorization_endpoint: "https://auth.civic.com/authorize",
    token_endpoint: "https://auth.civic.com/token",
    jwks_uri: "https://auth.civic.com/jwks",
    scopes_supported: DEFAULT_SCOPES,
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
    it("should fetch OIDC configuration from default URL without subdomain", async () => {
      const auth = await McpServerAuth.init();

      expect(global.fetch).toHaveBeenCalledWith(DEFAULT_WELLKNOWN_URL);
      expect(auth).toBeInstanceOf(McpServerAuth);
    });

    it("should fetch OIDC configuration from custom URL without subdomain", async () => {
      const customUrl = "https://custom.auth.com/.well-known/openid-configuration";
      const auth = await McpServerAuth.init({ wellKnownUrl: customUrl });

      expect(global.fetch).toHaveBeenCalledWith(customUrl);
      expect(auth).toBeInstanceOf(McpServerAuth);
    });

    it("should use custom client ID subdomain when dynamic registration is enabled", async () => {
      const auth = await McpServerAuth.init({
        clientId: "custom-client-id",
        allowDynamicClientRegistration: true,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://custom-client-id.auth.civic.com/oauth/.well-known/openid-configuration"
      );
      expect(auth).toBeInstanceOf(McpServerAuth);
    });

    it("should not use subdomain for custom client ID by default", async () => {
      const auth = await McpServerAuth.init({ clientId: "custom-client-id" });

      expect(global.fetch).toHaveBeenCalledWith(DEFAULT_WELLKNOWN_URL);
      expect(auth).toBeInstanceOf(McpServerAuth);
    });

    it("should throw error when fetch fails", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: "Not Found",
      });

      await expect(McpServerAuth.init()).rejects.toThrow("Failed to fetch Civic Auth configuration: Not Found");
    });

    it("should not use subdomain when allowDynamicClientRegistration is false", async () => {
      const auth = await McpServerAuth.init({ allowDynamicClientRegistration: false });

      expect(global.fetch).toHaveBeenCalledWith(DEFAULT_WELLKNOWN_URL);
      expect(auth).toBeInstanceOf(McpServerAuth);
    });

    it("should use public client ID subdomain when dynamic registration is enabled without custom client", async () => {
      const auth = await McpServerAuth.init({ allowDynamicClientRegistration: true });

      expect(global.fetch).toHaveBeenCalledWith(
        `https://${PUBLIC_CIVIC_CLIENT_ID}.auth.civic.com/oauth/.well-known/openid-configuration`
      );
      expect(auth).toBeInstanceOf(McpServerAuth);
    });
  });

  describe("getProtectedResourceMetadata", () => {
    it("should return correct metadata with default options", async () => {
      const auth = await McpServerAuth.init();
      const metadata = auth.getProtectedResourceMetadata("https://my-server.com");

      expect(metadata).toEqual({
        resource: "https://my-server.com",
        authorization_servers: ["https://auth.civic.com"],
        scopes_supported: DEFAULT_SCOPES,
        bearer_methods_supported: ["header"],
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
          client_id: PUBLIC_CIVIC_CLIENT_ID, // Use public client ID for default
          tid: undefined,
          scope: DEFAULT_SCOPES.slice(0, 2).join(" "),
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
        clientId: PUBLIC_CIVIC_CLIENT_ID,
        scopes: DEFAULT_SCOPES.slice(0, 2),
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

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow("Authentication failed");
    });

    it("should throw JWTVerificationError when token is invalid", async () => {
      const originalError = new Error('"exp" claim timestamp check failed');
      vi.mocked(jwtVerify).mockRejectedValue(originalError);

      const auth = await McpServerAuth.init();
      const mockRequest = {
        headers: {
          authorization: "Bearer invalid.jwt.token",
        },
      } as any;

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow(JWTVerificationError);
      await expect(auth.handleRequest(mockRequest)).rejects.toMatchObject({
        message: '"exp" claim timestamp check failed',
        originalError,
      });
    });

    it("should pass request to onLogin callback", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: PUBLIC_CIVIC_CLIENT_ID,
          tid: undefined,
          scope: DEFAULT_SCOPES[0],
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const onLoginCallback = vi.fn(async (authInfo, request) => {
        return {
          ...authInfo,
          extra: {
            ...authInfo.extra,
            customData: request?.headers?.["x-custom-header"],
          },
        };
      });

      const auth = await McpServerAuth.init({ onLogin: onLoginCallback });
      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
          "x-custom-header": "custom-value",
        },
      } as any;

      const authInfo = await auth.handleRequest(mockRequest);

      expect(onLoginCallback).toHaveBeenCalledWith(
        {
          token: "valid.jwt.token",
          clientId: PUBLIC_CIVIC_CLIENT_ID,
          scopes: [DEFAULT_SCOPES[0]],
          expiresAt: 1234567890,
          extra: {
            sub: "user123",
          },
        },
        mockRequest
      );

      expect(authInfo).toEqual({
        token: "valid.jwt.token",
        clientId: PUBLIC_CIVIC_CLIENT_ID,
        scopes: [DEFAULT_SCOPES[0]],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
          customData: "custom-value",
        },
      });
    });

    it("should allow onLogin to handle missing token", async () => {
      const onLoginCallback = vi.fn(async (_authInfo, request) => {
        // Create auth from API key when no bearer token
        const apiKey = request?.headers?.["x-api-key"];
        if (apiKey === "valid-api-key") {
          return {
            token: "",
            clientId: "api-client",
            scopes: ["api:access"],
            extra: {
              authType: "api-key",
              apiKey,
            },
          };
        }
        return null;
      }) as any;

      const auth = await McpServerAuth.init({ onLogin: onLoginCallback });
      const mockRequest = {
        headers: {
          "x-api-key": "valid-api-key",
        },
      } as any;

      const result = await auth.handleRequest(mockRequest);

      expect(result).toEqual({
        token: "",
        clientId: "api-client",
        scopes: ["api:access"],
        extra: {
          authType: "api-key",
          apiKey: "valid-api-key",
        },
      });
    });

    it("should throw error when onLogin returns null", async () => {
      const onLoginCallback = vi.fn(async () => null) as any;

      const auth = await McpServerAuth.init({ onLogin: onLoginCallback });
      const mockRequest = {
        headers: {},
      } as any;

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow("Authentication failed");
    });

    it("should handle missing scope claim in JWT", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          aud: PUBLIC_CIVIC_CLIENT_ID, // Use aud instead of client_id
          client_id: undefined,
          tid: PUBLIC_CIVIC_CLIENT_ID, // tid should match for public client
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
        clientId: PUBLIC_CIVIC_CLIENT_ID,
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
          client_id: PUBLIC_CIVIC_CLIENT_ID,
          tid: undefined,
          scope: DEFAULT_SCOPES[0],
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

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow("Authentication failed");
    });

    it("should verify client_id matches expected client ID", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: "wrong-client-id",
          scope: DEFAULT_SCOPES[0],
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init({ clientId: "expected-client-id" });
      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
        },
      } as any;

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow(
        "Invalid client_id or tid in token. Expected: expected-client-id"
      );
    });

    it("should verify tid matches expected client ID when client_id doesn't match", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: "dynamic-client-id",
          tid: "expected-client-id",
          scope: DEFAULT_SCOPES[0],
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init({ clientId: "expected-client-id" });
      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
        },
      } as any;

      const authInfo = await auth.handleRequest(mockRequest);

      expect(authInfo).toEqual({
        token: "valid.jwt.token",
        clientId: "dynamic-client-id",
        scopes: [DEFAULT_SCOPES[0]],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
        },
      });
    });

    it("should verify against public civic client ID when using default Civic auth", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: "wrong-client-id",
          tid: undefined,
          scope: DEFAULT_SCOPES[0],
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init(); // No clientId specified, using Civic
      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
        },
      } as any;

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow(JWTVerificationError);
      await expect(auth.handleRequest(mockRequest)).rejects.toMatchObject({
        message: `Invalid client_id or tid in token. Expected: ${PUBLIC_CIVIC_CLIENT_ID}`,
      });
    });

    it("should not verify client ID when using custom auth server without clientId", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: "any-client-id",
          scope: DEFAULT_SCOPES[0],
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init({
        wellKnownUrl: "https://custom.auth.com/.well-known/openid-configuration",
      });
      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
        },
      } as any;

      const authInfo = await auth.handleRequest(mockRequest);

      expect(authInfo).toEqual({
        token: "valid.jwt.token",
        clientId: "any-client-id",
        scopes: [DEFAULT_SCOPES[0]],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
        },
      });
    });

    it("should still verify client ID when allowDynamicClientRegistration is false", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: "wrong-client-id",
          tid: undefined,
          scope: DEFAULT_SCOPES[0],
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init({
        clientId: "expected-client-id",
        allowDynamicClientRegistration: false,
      });
      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
        },
      } as any;

      await expect(auth.handleRequest(mockRequest)).rejects.toThrow(JWTVerificationError);
      await expect(auth.handleRequest(mockRequest)).rejects.toMatchObject({
        message: "Invalid client_id or tid in token. Expected: expected-client-id",
      });
    });

    it("should include token in authInfo when successfully authenticated", async () => {
      const mockToken = "valid.jwt.token";
      const payload = {
        sub: "user123",
        client_id: PUBLIC_CIVIC_CLIENT_ID,
        tid: undefined,
        scope: DEFAULT_SCOPES.slice(0, 2).join(" "),
        exp: 1234567890,
      };

      vi.mocked(jwtVerify).mockResolvedValue({
        payload,
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init();
      const mockRequest = {
        headers: {
          authorization: `Bearer ${mockToken}`,
        },
      } as any;

      const authInfo = await auth.handleRequest(mockRequest);

      expect(authInfo.token).toBe(mockToken);
      expect(authInfo).toEqual({
        token: mockToken,
        clientId: payload.client_id,
        scopes: DEFAULT_SCOPES.slice(0, 2),
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
        },
      });
    });

    it("should verify against public client ID when allowDynamicClientRegistration is false", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: PUBLIC_CIVIC_CLIENT_ID,
          tid: undefined,
          scope: DEFAULT_SCOPES[0],
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init({ allowDynamicClientRegistration: false });
      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
        },
      } as any;

      const authInfo = await auth.handleRequest(mockRequest);

      expect(authInfo).toEqual({
        token: "valid.jwt.token",
        clientId: PUBLIC_CIVIC_CLIENT_ID,
        scopes: [DEFAULT_SCOPES[0]],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
        },
      });
    });
  });

  describe("local JWKS", () => {
    const mockJWKS = {
      keys: [
        {
          kty: "RSA",
          kid: "test-key-1",
          use: "sig",
          alg: "RS256",
          n: "test-n-value",
          e: "AQAB",
        },
      ],
    };

    it("should use local JWKS when provided in options", async () => {
      const auth = await McpServerAuth.init({ jwks: mockJWKS });

      expect(auth).toBeInstanceOf(McpServerAuth);
      // Verify OIDC config was still fetched
      expect(global.fetch).toHaveBeenCalledWith(DEFAULT_WELLKNOWN_URL);
    });

    it("should not call createRemoteJWKSet when local JWKS is provided", async () => {
      vi.clearAllMocks();
      await McpServerAuth.init({ jwks: mockJWKS });

      expect(createLocalJWKSet).toHaveBeenCalledWith(mockJWKS);
      expect(createRemoteJWKSet).not.toHaveBeenCalled();
    });

    it("should still fetch OIDC config when using local JWKS", async () => {
      const customUrl = "https://custom.auth.com/.well-known/openid-configuration";
      await McpServerAuth.init({
        wellKnownUrl: customUrl,
        jwks: mockJWKS,
      });

      expect(global.fetch).toHaveBeenCalledWith(customUrl);
    });

    it("should work with custom client ID and local JWKS", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: "custom-client-id",
          tid: undefined,
          scope: DEFAULT_SCOPES[0],
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init({
        clientId: "custom-client-id",
        jwks: mockJWKS,
      });

      const mockRequest = {
        headers: {
          authorization: "Bearer valid.jwt.token",
        },
      } as any;

      const authInfo = await auth.handleRequest(mockRequest);

      expect(authInfo).toEqual({
        token: "valid.jwt.token",
        clientId: "custom-client-id",
        scopes: [DEFAULT_SCOPES[0]],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
        },
      });
    });

    it("should verify JWT with local JWKS", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "user123",
          client_id: PUBLIC_CIVIC_CLIENT_ID,
          tid: undefined,
          scope: DEFAULT_SCOPES.join(" "),
          exp: 1234567890,
        },
        protectedHeader: {} as any,
      } as any);

      const auth = await McpServerAuth.init({ jwks: mockJWKS });

      const mockRequest = {
        headers: {
          authorization: "Bearer test.jwt.token",
        },
      } as any;

      const authInfo = await auth.handleRequest(mockRequest);

      expect(jwtVerify).toHaveBeenCalledWith(
        "test.jwt.token",
        "mockLocalJWKS", // The mocked local JWKS
        { issuer: mockOidcConfig.issuer }
      );

      expect(authInfo.token).toBe("test.jwt.token");
    });
  });
});
