import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OIDCWellKnownConfiguration } from "../types.js";
import { OAuthProxyHandler } from "./OAuthProxyHandler.js";
import type { LegacyOAuthOptions } from "./types.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("OAuthProxyHandler", () => {
  let handler: OAuthProxyHandler<any, IncomingMessage>;
  let mockRequest: Partial<IncomingMessage>;
  let mockResponse: Partial<ServerResponse>;
  let oidcConfig: OIDCWellKnownConfiguration;
  let options: LegacyOAuthOptions<any, IncomingMessage>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup OIDC config
    oidcConfig = {
      issuer: "https://auth.civic.com",
      authorization_endpoint: "https://auth.civic.com/authorize",
      token_endpoint: "https://auth.civic.com/token",
      registration_endpoint: "https://auth.civic.com/register",
      jwks_uri: "https://auth.civic.com/.well-known/jwks.json",
      scopes_supported: ["openid", "email", "profile"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
    };

    // Setup options
    options = {
      clientId: "test-client-id",
    };

    // Create handler
    handler = new OAuthProxyHandler(options, oidcConfig);

    // Setup mock request
    mockRequest = {
      url: "/authorize",
      headers: {
        host: "localhost:3000",
      },
      on: vi.fn(),
    };

    // Setup mock response
    mockResponse = {
      writeHead: vi.fn(),
      end: vi.fn(),
      setHeader: vi.fn(),
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("handleAuthorize", () => {
    it("should redirect to auth server with proper parameters", async () => {
      mockRequest.url =
        "/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:8080/callback&state=abc123";

      await handler.handleAuthorize(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        302,
        expect.objectContaining({
          Location: expect.stringContaining("https://auth.civic.com/authorize"),
        })
      );

      const locationHeader = (mockResponse.writeHead as any).mock.calls[0][1].Location;
      const url = new URL(locationHeader);

      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("client_id")).toBe("test-client-id");
      expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/oauth/callback");
      expect(url.searchParams.get("state")).toBeTruthy(); // Internal state
    });

    it("should handle PKCE parameters", async () => {
      mockRequest.url =
        "/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:8080/callback&code_challenge=challenge&code_challenge_method=S256";

      await handler.handleAuthorize(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      const locationHeader = (mockResponse.writeHead as any).mock.calls[0][1].Location;
      const url = new URL(locationHeader);

      expect(url.searchParams.get("code_challenge")).toBe("challenge");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    });

    it("should return error for missing required parameters", async () => {
      mockRequest.url = "/authorize?response_type=code"; // Missing client_id and redirect_uri

      await handler.handleAuthorize(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(400, { "Content-Type": "application/json" });
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining("invalid_request"));
    });

    it("should return error for unsupported response type", async () => {
      mockRequest.url = "/authorize?response_type=token&client_id=test&redirect_uri=http://localhost:8080/callback";

      await handler.handleAuthorize(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(302, expect.any(Object));
      const locationHeader = (mockResponse.writeHead as any).mock.calls[0][1].Location;
      expect(locationHeader).toContain("error=unsupported_response_type");
    });
  });

  describe("handleCallback", () => {
    it("should handle successful callback with code", async () => {
      // First, simulate storing state
      const stateStore = (handler as any).stateStore;
      await stateStore.set("test-state", {
        redirectUri: "http://localhost:8080/callback",
        clientState: "client-state-123",
        createdAt: Date.now(),
      });

      mockRequest.url = "/oauth/callback?code=auth-code&state=test-state";

      await handler.handleCallback(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        302,
        expect.objectContaining({
          Location: expect.stringContaining("http://localhost:8080/callback"),
        })
      );

      const locationHeader = (mockResponse.writeHead as any).mock.calls[0][1].Location;
      const url = new URL(locationHeader);

      expect(url.searchParams.get("code")).toBe("auth-code");
      expect(url.searchParams.get("state")).toBe("client-state-123");
    });

    it("should handle error callback", async () => {
      const stateStore = (handler as any).stateStore;
      await stateStore.set("test-state", {
        redirectUri: "http://localhost:8080/callback",
        clientState: "client-state-123",
        createdAt: Date.now(),
      });

      mockRequest.url = "/oauth/callback?error=access_denied&error_description=User%20denied&state=test-state";

      await handler.handleCallback(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      const locationHeader = (mockResponse.writeHead as any).mock.calls[0][1].Location;
      const url = new URL(locationHeader);

      expect(url.searchParams.get("error")).toBe("access_denied");
      expect(url.searchParams.get("error_description")).toBe("User denied");
    });

    it("should return error for invalid state", async () => {
      mockRequest.url = "/oauth/callback?code=auth-code&state=invalid-state";

      await handler.handleCallback(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(400, { "Content-Type": "application/json" });
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining("Invalid state"));
    });
  });

  describe("handleToken", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        status: 200,
        ok: true,
        headers: new Map([["content-type", "application/json"]]),
        text: async () =>
          JSON.stringify({
            access_token: "test-access-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
      });
    });

    it("should forward token request to auth server", async () => {
      // Mock Express-parsed body
      (mockRequest as any).body = {
        grant_type: "authorization_code",
        code: "test-code",
        redirect_uri: "http://localhost:8080/callback",
        client_id: "test-client",
      };

      await handler.handleToken(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.civic.com/token",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: expect.stringContaining("grant_type=authorization_code"),
        })
      );

      expect(mockResponse.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          "Content-Type": "application/json",
        })
      );
    });

    it("should handle form-encoded body", async () => {
      (mockRequest as any).body = undefined;

      let dataCallback: ((chunk: any) => void) | undefined;
      let endCallback: (() => void) | undefined;

      mockRequest.on = vi.fn((event: string, callback: any) => {
        if (event === "data") dataCallback = callback;
        if (event === "end") endCallback = callback;
        return mockRequest as any;
      });

      const tokenPromise = handler.handleToken(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      // Simulate receiving data
      dataCallback?.("grant_type=authorization_code&code=test-code");
      endCallback?.();

      await tokenPromise;

      expect(mockFetch).toHaveBeenCalled();
      expect(mockResponse.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    });
  });

  describe("handleRegistration", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        status: 200,
        ok: true,
        headers: new Map([["content-type", "application/json"]]),
        text: async () =>
          JSON.stringify({
            client_id: "new-client-id",
            client_secret: "new-client-secret",
          }),
      });
    });

    it("should replace scope with fixed scopes", async () => {
      (mockRequest as any).body = {
        client_name: "Test Client",
        redirect_uris: ["http://localhost:8080/callback"],
        scope: "read write custom",
      };

      await handler.handleRegistration(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.civic.com/register",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"scope":"openid email profile"'),
        })
      );

      const callBody = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(callBody.scope).toBe("openid email profile");
      expect(callBody.scopes).toBeUndefined();
    });

    it("should handle JSON body", async () => {
      (mockRequest as any).body = undefined;
      mockRequest.headers = { ...mockRequest.headers, "content-type": "application/json" };

      let dataCallback: ((chunk: any) => void) | undefined;
      let endCallback: (() => void) | undefined;

      mockRequest.on = vi.fn((event: string, callback: any) => {
        if (event === "data") dataCallback = callback;
        if (event === "end") endCallback = callback;
        return mockRequest as any;
      });

      const registrationPromise = handler.handleRegistration(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Simulate receiving JSON data
      const testData = {
        client_name: "Test Client",
        redirect_uris: ["http://localhost:8080/callback"],
        scope: "invalid scope",
      };
      dataCallback?.(JSON.stringify(testData));
      endCallback?.();

      await registrationPromise;

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(callBody.scope).toBe("openid email profile");
    });

    it("should return 404 if registration endpoint not configured", async () => {
      const handlerNoReg = new OAuthProxyHandler(options, {
        ...oidcConfig,
        registration_endpoint: undefined,
      });

      await handlerNoReg.handleRegistration(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(404, { "Content-Type": "application/json" });
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining("Registration not supported"));
    });

    it("should handle registration fetch errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      (mockRequest as any).body = {
        client_name: "Test Client",
        redirect_uris: ["http://localhost:8080/callback"],
      };

      await handler.handleRegistration(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(500, { "Content-Type": "application/json" });
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining("server_error"));
    });

    it("should handle form-encoded body in registration", async () => {
      (mockRequest as any).body = undefined;
      mockRequest.headers = { ...mockRequest.headers, "content-type": "application/x-www-form-urlencoded" };

      let dataCallback: ((chunk: any) => void) | undefined;
      let endCallback: (() => void) | undefined;

      mockRequest.on = vi.fn((event: string, callback: any) => {
        if (event === "data") dataCallback = callback;
        if (event === "end") endCallback = callback;
        return mockRequest as any;
      });

      const registrationPromise = handler.handleRegistration(
        mockRequest as IncomingMessage,
        mockResponse as ServerResponse
      );

      // Simulate receiving form data
      dataCallback?.("client_name=Test+Client&redirect_uris=http%3A%2F%2Flocalhost%3A8080%2Fcallback&scope=read");
      endCallback?.();

      await registrationPromise;

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
      expect(callBody.scope).toBe("openid email profile");
      expect(callBody.client_name).toBe("Test Client");
    });
  });

  describe("error handling", () => {
    it("should handle missing URL in handleAuthorize", async () => {
      mockRequest.url = undefined;

      await handler.handleAuthorize(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(500, { "Content-Type": "application/json" });
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining("server_error"));
    });

    it("should handle missing URL in handleCallback", async () => {
      mockRequest.url = undefined;

      await handler.handleCallback(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(500, { "Content-Type": "application/json" });
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining("server_error"));
    });

    it("should handle fetch errors in handleToken", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      (mockRequest as any).body = {
        grant_type: "authorization_code",
        code: "test-code",
      };

      await handler.handleToken(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(500, { "Content-Type": "application/json" });
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining("server_error"));
    });

    it("should handle invalid token request", async () => {
      (mockRequest as any).body = {
        // Missing grant_type
      };

      await handler.handleToken(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(400, { "Content-Type": "application/json" });
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining("invalid_request"));
    });

    it("should handle error in parseRequestBody", async () => {
      (mockRequest as any).body = undefined;

      let errorCallback: ((error: any) => void) | undefined;
      let _dataCallback: ((chunk: any) => void) | undefined;
      let _endCallback: (() => void) | undefined;

      mockRequest.on = vi.fn((event: string, callback: any) => {
        if (event === "error") errorCallback = callback;
        if (event === "data") _dataCallback = callback;
        if (event === "end") _endCallback = callback;
        return mockRequest as any;
      });

      const tokenPromise = handler.handleToken(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      // Trigger error before any data is sent
      errorCallback?.(new Error("Parse error"));

      await tokenPromise;

      expect(mockResponse.writeHead).toHaveBeenCalledWith(500, { "Content-Type": "application/json" });
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining("server_error"));
    });

    it("should handle missing redirect URI in sendErrorRedirect", async () => {
      mockRequest.url = "/authorize?response_type=code&client_id=test"; // Missing redirect_uri

      await handler.handleAuthorize(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(400, { "Content-Type": "application/json" });
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining("invalid_request"));
    });

    it("should handle error details in sendErrorRedirect", async () => {
      const stateStore = (handler as any).stateStore;
      await stateStore.set("test-state", {
        redirectUri: "http://localhost:8080/callback",
        clientState: "client-state-123",
        createdAt: Date.now(),
      });

      mockRequest.url =
        "/oauth/callback?error=invalid_scope&error_description=Scope%20not%20allowed&error_uri=https://example.com/error&state=test-state";

      await handler.handleCallback(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      const locationHeader = (mockResponse.writeHead as any).mock.calls[0][1].Location;
      const url = new URL(locationHeader);

      expect(url.searchParams.get("error")).toBe("invalid_scope");
      expect(url.searchParams.get("error_description")).toBe("Scope not allowed");
      expect(url.searchParams.get("error_uri")).toBe("https://example.com/error");
    });
  });

  describe("parseRequestBody edge cases", () => {
    it("should handle empty body", async () => {
      (mockRequest as any).body = undefined;

      let _dataCallback: ((chunk: any) => void) | undefined;
      let endCallback: (() => void) | undefined;

      mockRequest.on = vi.fn((event: string, callback: any) => {
        if (event === "data") _dataCallback = callback;
        if (event === "end") endCallback = callback;
        return mockRequest as any;
      });

      const tokenPromise = handler.handleToken(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      // Send empty body
      endCallback?.();

      await tokenPromise;

      expect(mockResponse.writeHead).toHaveBeenCalledWith(400, { "Content-Type": "application/json" });
    });

    it("should handle URLSearchParams parse error", async () => {
      (mockRequest as any).body = undefined;

      // Mock URLSearchParams to throw
      const originalURLSearchParams = global.URLSearchParams;
      global.URLSearchParams = vi.fn().mockImplementation(() => {
        throw new Error("Invalid URL encoding");
      });

      let dataCallback: ((chunk: any) => void) | undefined;
      let endCallback: (() => void) | undefined;

      mockRequest.on = vi.fn((event: string, callback: any) => {
        if (event === "data") dataCallback = callback;
        if (event === "end") endCallback = callback;
        return mockRequest as any;
      });

      const tokenPromise = handler.handleToken(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      // Send invalid data
      dataCallback?.("invalid%");
      endCallback?.();

      await tokenPromise;

      expect(mockResponse.writeHead).toHaveBeenCalledWith(500, { "Content-Type": "application/json" });
      expect(mockResponse.end).toHaveBeenCalledWith(expect.stringContaining("server_error"));

      // Restore original
      global.URLSearchParams = originalURLSearchParams;
    });
  });

  describe("getMcpCallbackUrl", () => {
    it("should handle Express request with protocol property", async () => {
      // Add protocol property to simulate Express request
      (mockRequest as any).protocol = "https";
      mockRequest.url = "/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:8080/callback";

      await handler.handleAuthorize(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      expect(mockResponse.writeHead).toHaveBeenCalledWith(302, expect.any(Object));
      const locationHeader = (mockResponse.writeHead as any).mock.calls[0][1].Location;
      const url = new URL(locationHeader);

      // Should use https from Express protocol
      expect(url.searchParams.get("redirect_uri")).toBe("https://localhost:3000/oauth/callback");
    });
  });

  describe("custom state store", () => {
    it("should use custom state store when provided", async () => {
      const mockStateStore = {
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const customHandler = new OAuthProxyHandler({ ...options, stateStore: mockStateStore }, oidcConfig);

      mockRequest.url = "/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:8080/callback";

      await customHandler.handleAuthorize(mockRequest as IncomingMessage, mockResponse as ServerResponse);

      // Verify custom state store was used
      expect(mockStateStore.set).toHaveBeenCalled();
      const [stateKey, stateData] = mockStateStore.set.mock.calls[0];
      expect(stateKey).toBeTruthy();
      expect(stateData).toMatchObject({
        redirectUri: "http://localhost:8080/callback",
        clientId: "test",
      });
    });
  });
});
