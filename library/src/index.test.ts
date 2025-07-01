import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SCOPES } from "./constants.js";
import { auth, McpServerAuth } from "./index.js";
import { AuthenticationError, JWTVerificationError } from "./types.js";

let mockGetProtectedResourceMetadata: any;
let mockVerifyToken: any;
let mockHandleRequest: any;

// Mock OAuthProxyHandler
vi.mock("./legacy/OAuthProxyHandler.js", () => ({
  OAuthProxyHandler: vi.fn().mockImplementation(() => ({
    handleAuthorize: vi.fn().mockImplementation((_req, res) => {
      res.redirect(302, "https://auth.civic.com/oauth/authorize");
    }),
    handleCallback: vi.fn().mockImplementation((_req, res) => {
      res.status(400).json({ error: "invalid_request" });
    }),
    handleToken: vi.fn().mockImplementation((_req, res) => {
      res.status(400).json({ error: "invalid_request" });
    }),
    handleRegistration: vi.fn().mockImplementation((_req, res) => {
      res.status(400).json({ error: "invalid_request" });
    }),
  })),
}));

// Mock McpServerAuth
vi.mock("./McpServerAuth.js", () => ({
  McpServerAuth: {
    init: vi.fn().mockImplementation((_options) => {
      mockGetProtectedResourceMetadata = vi.fn((issuerUrl) => ({
        resource: issuerUrl,
        authorization_servers: ["https://auth.civic.com"],
        scopes_supported: ["openid", "profile", "email", "offline_access"],
        bearer_methods_supported: ["header"],
        resource_documentation: "https://docs.civic.com",
        resource_policy_uri: "https://www.civic.com/privacy-policy",
      }));
      mockVerifyToken = vi.fn();
      mockHandleRequest = vi.fn();

      return {
        getProtectedResourceMetadata: mockGetProtectedResourceMetadata,
        verifyToken: mockVerifyToken,
        handleRequest: mockHandleRequest,
        oidcConfig: {
          issuer: "https://auth.civic.com/oauth",
          authorization_endpoint: "https://auth.civic.com/oauth/authorize",
          token_endpoint: "https://auth.civic.com/oauth/token",
          jwks_uri: "https://auth.civic.com/oauth/.well-known/jwks.json",
          registration_endpoint: "https://auth.civic.com/oauth/register",
        },
      };
    }),
  },
}));

describe("auth middleware", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();

    // Apply the auth middleware
    app.use(await auth());

    // Add test endpoints
    app.get("/test", (req, res) => {
      res.json({ auth: (req as any).auth });
    });
    app.get("/mcp/test", (req, res) => {
      res.json({ auth: (req as any).auth });
    });
  });

  describe("/.well-known/oauth-protected-resource", () => {
    it("should expose protected resource metadata", async () => {
      const response = await request(app).get("/.well-known/oauth-protected-resource").expect(200);

      // The resource URL will include the port from supertest
      expect(response.body.resource).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(response.body.authorization_servers).toEqual(["https://auth.civic.com"]);
      expect(response.body.scopes_supported).toEqual(DEFAULT_SCOPES);
      expect(response.body.bearer_methods_supported).toEqual(["header"]);
      expect(response.body.resource_documentation).toBe("https://docs.civic.com");
      expect(response.body.resource_policy_uri).toBe("https://www.civic.com/privacy-policy");
    });

    it("should use custom issuerUrl if provided", async () => {
      const customApp = express();
      customApp.use(await auth({ issuerUrl: "https://custom-server.com" }));

      const response = await request(customApp).get("/.well-known/oauth-protected-resource").expect(200);

      expect(response.body.resource).toBe("https://custom-server.com");
    });
  });

  describe("token validation", () => {
    it("should allow requests with valid tokens", async () => {
      const mockAuthInfo = {
        token: "valid.jwt.token",
        clientId: "client123",
        scopes: DEFAULT_SCOPES.slice(0, 2),
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
        },
      };

      mockHandleRequest.mockResolvedValue(mockAuthInfo);

      const response = await request(app).get("/mcp/test").set("Authorization", "Bearer valid.jwt.token").expect(200);

      expect(mockHandleRequest).toHaveBeenCalledWith(expect.any(Object));
      expect(response.body.auth).toEqual(mockAuthInfo);
    });

    it("should reject requests without authorization header", async () => {
      mockHandleRequest.mockRejectedValue(new AuthenticationError("Authentication failed"));

      const response = await request(app).get("/mcp/test").expect(401);

      expect(response.body).toEqual({
        error: "authentication_error",
        error_description: "Authentication failed",
      });
    });

    it("should reject requests with invalid authorization header", async () => {
      mockHandleRequest.mockRejectedValue(new AuthenticationError("Authentication failed"));

      const response = await request(app).get("/mcp/test").set("Authorization", "Basic invalid").expect(401);

      expect(response.body).toEqual({
        error: "authentication_error",
        error_description: "Authentication failed",
      });
    });

    it("should reject requests with invalid tokens", async () => {
      mockHandleRequest.mockRejectedValue(new AuthenticationError("Token validation failed"));

      const response = await request(app).get("/mcp/test").set("Authorization", "Bearer invalid.jwt.token").expect(401);

      expect(mockHandleRequest).toHaveBeenCalledWith(expect.any(Object));
      expect(response.body).toEqual({
        error: "authentication_error",
        error_description: "Token validation failed",
      });
    });

    it("should skip auth for metadata endpoint", async () => {
      await request(app).get("/.well-known/oauth-protected-resource").expect(200);

      // Should not call handleRequest for metadata endpoint
      expect(mockHandleRequest).not.toHaveBeenCalled();
    });

    it("should allow non-MCP routes without authentication", async () => {
      const response = await request(app).get("/test").expect(200);

      // Should not call handleRequest for non-MCP routes
      expect(mockHandleRequest).not.toHaveBeenCalled();
      expect(response.body.auth).toBeUndefined();
    });

    it("should pass the full request object to handleRequest", async () => {
      const mockAuthInfo = {
        token: "valid.jwt.token",
        clientId: "client123",
        scopes: ["openid"],
        expiresAt: 1234567890,
      };

      mockHandleRequest.mockResolvedValue(mockAuthInfo);

      await request(app)
        .get("/mcp/test")
        .set("Authorization", "Bearer valid.jwt.token")
        .set("X-Custom-Header", "custom-value")
        .expect(200);

      // Verify handleRequest was called with a request object containing headers
      expect(mockHandleRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: "Bearer valid.jwt.token",
            "x-custom-header": "custom-value",
          }),
        })
      );
    });

    it("should return 401 for expired JWT tokens", async () => {
      // Mock handleRequest to throw a JWTVerificationError (like what happens with expired tokens)
      mockHandleRequest.mockRejectedValue(new JWTVerificationError('"exp" claim timestamp check failed'));

      const response = await request(app).get("/mcp/test").set("Authorization", "Bearer expired.jwt.token").expect(401);

      expect(mockHandleRequest).toHaveBeenCalledWith(expect.any(Object));
      expect(response.body).toEqual({
        error: "authentication_error",
        error_description: '"exp" claim timestamp check failed',
      });
    });

    it("should return 500 for unknown errors", async () => {
      // Mock handleRequest to throw a non-authentication error
      mockHandleRequest.mockRejectedValue(new Error("Unknown database error"));

      const response = await request(app).get("/mcp/test").set("Authorization", "Bearer valid.jwt.token").expect(500);

      expect(mockHandleRequest).toHaveBeenCalledWith(expect.any(Object));
      expect(response.body).toEqual({
        error: "internal_error",
        error_description: "An unexpected error occurred",
      });
    });

    it("should skip auth for legacy OAuth endpoints", async () => {
      // Test a legacy OAuth endpoint - /authorize should redirect
      mockHandleRequest.mockClear();

      // The /authorize endpoint should redirect without authentication
      await request(app)
        .get("/authorize")
        .query({ client_id: "test", redirect_uri: "http://localhost:3000/callback" })
        .expect(302);

      // Should not call handleRequest for legacy OAuth endpoints
      expect(mockHandleRequest).not.toHaveBeenCalled();

      // Test another endpoint - /token should return 400 without proper params
      mockHandleRequest.mockClear();
      await request(app).post("/token").expect(400);

      expect(mockHandleRequest).not.toHaveBeenCalled();
    });
  });

  describe("configuration options", () => {
    it("should pass configuration to McpServerAuth", async () => {
      const mockInit = vi.mocked(McpServerAuth.init);

      await auth({
        issuerUrl: new URL("https://custom-server.com"),
        onLogin: vi.fn() as any,
      });

      expect(mockInit).toHaveBeenCalledWith({
        issuerUrl: new URL("https://custom-server.com"),
        onLogin: expect.any(Function),
      });
    });

    it("should use custom mcpRoute when provided", async () => {
      const customApp = express();
      customApp.use(await auth({ mcpRoute: "/api" }));

      // Add test endpoints
      customApp.get("/api/test", (req, res) => {
        res.json({ auth: (req as any).auth });
      });
      customApp.get("/mcp/test", (req, res) => {
        res.json({ auth: (req as any).auth });
      });

      // Reset mock for this test
      mockHandleRequest.mockClear();

      // Should not protect /mcp routes when custom mcpRoute is set
      await request(customApp).get("/mcp/test").expect(200);
      expect(mockHandleRequest).not.toHaveBeenCalled();

      // Should protect /api routes
      mockHandleRequest.mockRejectedValue(new AuthenticationError("Authentication failed"));
      const response = await request(customApp).get("/api/test").expect(401);
      expect(response.body.error).toBe("authentication_error");
    });
  });

  describe("legacy OAuth endpoints", () => {
    it("should expose /.well-known/oauth-authorization-server when legacy mode is enabled", async () => {
      const middleware = await auth();
      app.use(middleware);

      const response = await request(app).get("/.well-known/oauth-authorization-server");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        issuer: expect.any(String),
        authorization_endpoint: expect.stringContaining("/authorize"),
        token_endpoint: expect.stringContaining("/token"),
        registration_endpoint: expect.stringContaining("/register"),
        scopes_supported: expect.any(Array),
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
      });
    });

    it("should not expose legacy endpoints when disabled", async () => {
      // Create a new app for this test
      const disabledApp = express();
      const middleware = await auth({ enableLegacyOAuth: false });
      disabledApp.use(middleware);

      const response = await request(disabledApp).get("/.well-known/oauth-authorization-server");

      expect(response.status).toBe(404);
    });

    it("should use custom state store when provided", async () => {
      // Since we're only testing that the custom state store is passed through,
      // we can use a simpler approach by checking if the option is properly configured
      const mockStateStore = {
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
        cleanup: vi.fn().mockResolvedValue(undefined),
      };

      // Just verify the middleware accepts the stateStore option without error
      const customApp = express();
      const middleware = await auth({
        enableLegacyOAuth: true,
        stateStore: mockStateStore,
      });
      customApp.use(middleware);

      // Verify the app was configured correctly by checking if legacy endpoints exist
      const response = await request(customApp).get("/.well-known/oauth-authorization-server");
      expect(response.status).toBe(200);

      // The actual state store usage is tested in OAuthProxyHandler.test.ts
    });
  });
});
