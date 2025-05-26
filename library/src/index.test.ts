import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "./index.js";

let mockGetProtectedResourceMetadata: any;
let mockVerifyToken: any;
let mockHandleRequest: any;

// Mock McpServerAuth
vi.mock("./McpServerAuth.js", () => ({
  McpServerAuth: {
    init: vi.fn().mockImplementation((_options) => {
      mockGetProtectedResourceMetadata = vi.fn((issuerUrl) => ({
        resource: issuerUrl,
        authorization_servers: ["https://auth.civic.com"],
        scopes_supported: ["openid", "profile", "email"],
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

    // Add a test endpoint
    app.get("/test", (req, res) => {
      res.json({ auth: (req as any).auth });
    });
  });

  describe("/.well-known/oauth-protected-resource", () => {
    it("should expose protected resource metadata", async () => {
      const response = await request(app).get("/.well-known/oauth-protected-resource").expect(200);

      // The resource URL will include the port from supertest
      expect(response.body.resource).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(response.body.authorization_servers).toEqual(["https://auth.civic.com"]);
      expect(response.body.scopes_supported).toEqual(["openid", "profile", "email"]);
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
        scopes: ["openid", "profile"],
        expiresAt: 1234567890,
        extra: {
          sub: "user123",
        },
      };

      mockHandleRequest.mockResolvedValue(mockAuthInfo);

      const response = await request(app).get("/test").set("Authorization", "Bearer valid.jwt.token").expect(200);

      expect(mockHandleRequest).toHaveBeenCalledWith(expect.any(Object));
      expect(response.body.auth).toEqual(mockAuthInfo);
    });

    it("should reject requests without authorization header", async () => {
      mockHandleRequest.mockRejectedValue(new Error("Authentication failed"));

      const response = await request(app).get("/test").expect(401);

      expect(response.body).toEqual({
        error: "unauthorized",
        error_description: "Authentication failed",
      });
    });

    it("should reject requests with invalid authorization header", async () => {
      mockHandleRequest.mockRejectedValue(new Error("Authentication failed"));

      const response = await request(app).get("/test").set("Authorization", "Basic invalid").expect(401);

      expect(response.body).toEqual({
        error: "unauthorized",
        error_description: "Authentication failed",
      });
    });

    it("should reject requests with invalid tokens", async () => {
      mockHandleRequest.mockRejectedValue(new Error("Token validation failed"));

      const response = await request(app).get("/test").set("Authorization", "Bearer invalid.jwt.token").expect(401);

      expect(mockHandleRequest).toHaveBeenCalledWith(expect.any(Object));
      expect(response.body).toEqual({
        error: "invalid_token",
        error_description: "Token validation failed",
      });
    });

    it("should skip auth for metadata endpoint", async () => {
      const _response = await request(app).get("/.well-known/oauth-protected-resource").expect(200);

      // Should not call handleRequest for metadata endpoint
      expect(mockHandleRequest).not.toHaveBeenCalled();
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
        .get("/test")
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

  });

  describe("configuration options", () => {
    it("should pass configuration to McpServerAuth", async () => {
      const { McpServerAuth } = await import("./McpServerAuth.js");
      const mockInit = vi.mocked(McpServerAuth.init);
      
      await auth({
        issuerUrl: new URL("https://custom-server.com"),
        onLogin: vi.fn(),
      });

      expect(mockInit).toHaveBeenCalledWith({
        issuerUrl: new URL("https://custom-server.com"),
        onLogin: expect.any(Function),
      });
    });
  });
});
