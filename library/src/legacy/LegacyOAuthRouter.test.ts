import type { Request, Response } from "express";
import { Router } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OIDCWellKnownConfiguration } from "../types.js";
import { LegacyOAuthRouter } from "./LegacyOAuthRouter.js";
import { LEGACY_OAUTH_PATHS } from "./constants.js";

// Mock Express Router
vi.mock("express", () => ({
  Router: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    use: vi.fn(),
  })),
}));

// Mock OAuthProxyHandler
vi.mock("./OAuthProxyHandler.js", () => ({
  OAuthProxyHandler: vi.fn().mockImplementation(() => ({
    handleAuthorize: vi.fn(),
    handleCallback: vi.fn(),
    handleToken: vi.fn(),
    handleRegistration: vi.fn(),
  })),
}));

describe("LegacyOAuthRouter", () => {
  let router: LegacyOAuthRouter<any>;
  let mockExpressRouter: any;
  let oidcConfig: OIDCWellKnownConfiguration;
  let options: any;

  beforeEach(() => {
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
      scopesSupported: ["custom-scope"],
    };

    // Get the mocked router instance
    mockExpressRouter = {
      get: vi.fn(),
      post: vi.fn(),
      use: vi.fn(),
    };
    (Router as any).mockReturnValue(mockExpressRouter);

    // Create router
    router = new LegacyOAuthRouter(options, oidcConfig);
  });

  describe("createRouter", () => {
    it("should create router with all legacy OAuth endpoints", () => {
      const result = router.createRouter();

      expect(result).toBe(mockExpressRouter);

      // Check that all endpoints are registered
      expect(mockExpressRouter.get).toHaveBeenCalledWith(LEGACY_OAUTH_PATHS.WELL_KNOWN, expect.any(Function));
      expect(mockExpressRouter.get).toHaveBeenCalledWith(LEGACY_OAUTH_PATHS.AUTHORIZE, expect.any(Function));
      expect(mockExpressRouter.get).toHaveBeenCalledWith("/oauth/callback", expect.any(Function));
      expect(mockExpressRouter.post).toHaveBeenCalledWith(LEGACY_OAUTH_PATHS.TOKEN, expect.any(Function));
      expect(mockExpressRouter.post).toHaveBeenCalledWith(LEGACY_OAUTH_PATHS.REGISTER, expect.any(Function));
    });

    it("should not register registration endpoint if not in OIDC config", () => {
      const routerNoReg = new LegacyOAuthRouter(options, {
        ...oidcConfig,
        registration_endpoint: undefined,
      });

      routerNoReg.createRouter();

      // Should not register the registration endpoint
      expect(mockExpressRouter.post).not.toHaveBeenCalledWith(LEGACY_OAUTH_PATHS.REGISTER, expect.any(Function));
    });

    it("should return correct metadata for well-known endpoint", () => {
      router.createRouter();

      // Get the handler for the well-known endpoint
      const wellKnownHandler = mockExpressRouter.get.mock.calls.find(
        (call: any) => call[0] === LEGACY_OAUTH_PATHS.WELL_KNOWN
      )?.[1];

      expect(wellKnownHandler).toBeDefined();

      // Mock request and response
      const mockReq = {
        protocol: "https",
        get: vi.fn((header: string) => {
          if (header === "host") return "example.com";
          return undefined;
        }),
      } as unknown as Request;

      const mockRes = {
        json: vi.fn(),
      } as unknown as Response;

      // Call the handler
      wellKnownHandler(mockReq, mockRes);

      // Check the response
      expect(mockRes.json).toHaveBeenCalledWith({
        issuer: "https://example.com",
        authorization_endpoint: `https://example.com${LEGACY_OAUTH_PATHS.AUTHORIZE}`,
        token_endpoint: `https://example.com${LEGACY_OAUTH_PATHS.TOKEN}`,
        registration_endpoint: `https://example.com${LEGACY_OAUTH_PATHS.REGISTER}`,
        scopes_supported: ["custom-scope"], // From options
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
        code_challenge_methods_supported: ["S256", "plain"],
      });
    });

    it("should use OIDC scopes if no custom scopes provided", () => {
      const routerNoScopes = new LegacyOAuthRouter({}, oidcConfig);
      routerNoScopes.createRouter();

      const wellKnownHandler = mockExpressRouter.get.mock.calls.find(
        (call: any) => call[0] === LEGACY_OAUTH_PATHS.WELL_KNOWN
      )?.[1];

      const mockReq = {
        protocol: "https",
        get: vi.fn(() => "example.com"),
      } as unknown as Request;

      const mockRes = {
        json: vi.fn(),
      } as unknown as Response;

      wellKnownHandler(mockReq, mockRes);

      const metadata = vi.mocked(mockRes.json).mock.calls[0][0];
      expect(metadata.scopes_supported).toEqual(["openid", "email", "profile"]);
    });

    it("should delegate authorize requests to OAuthProxyHandler", async () => {
      router.createRouter();

      const authorizeHandler = mockExpressRouter.get.mock.calls.find(
        (call: any) => call[0] === LEGACY_OAUTH_PATHS.AUTHORIZE
      )?.[1];

      const mockReq = {} as Request;
      const mockRes = {} as Response;

      await authorizeHandler(mockReq, mockRes);

      const oauthHandler = (router as any).oauthHandler;
      expect(oauthHandler.handleAuthorize).toHaveBeenCalledWith(mockReq, mockRes);
    });

    it("should delegate callback requests to OAuthProxyHandler", async () => {
      router.createRouter();

      const callbackHandler = mockExpressRouter.get.mock.calls.find((call: any) => call[0] === "/oauth/callback")?.[1];

      const mockReq = {} as Request;
      const mockRes = {} as Response;

      await callbackHandler(mockReq, mockRes);

      const oauthHandler = (router as any).oauthHandler;
      expect(oauthHandler.handleCallback).toHaveBeenCalledWith(mockReq, mockRes);
    });

    it("should delegate token requests to OAuthProxyHandler", async () => {
      router.createRouter();

      const tokenHandler = mockExpressRouter.post.mock.calls.find(
        (call: any) => call[0] === LEGACY_OAUTH_PATHS.TOKEN
      )?.[1];

      const mockReq = {} as Request;
      const mockRes = {} as Response;

      await tokenHandler(mockReq, mockRes);

      const oauthHandler = (router as any).oauthHandler;
      expect(oauthHandler.handleToken).toHaveBeenCalledWith(mockReq, mockRes);
    });

    it("should delegate registration requests to OAuthProxyHandler", async () => {
      router.createRouter();

      const registrationHandler = mockExpressRouter.post.mock.calls.find(
        (call: any) => call[0] === LEGACY_OAUTH_PATHS.REGISTER
      )?.[1];

      const mockReq = {} as Request;
      const mockRes = {} as Response;

      await registrationHandler(mockReq, mockRes);

      const oauthHandler = (router as any).oauthHandler;
      expect(oauthHandler.handleRegistration).toHaveBeenCalledWith(mockReq, mockRes);
    });
  });

  describe("getOAuthPaths", () => {
    it("should return all legacy OAuth paths", () => {
      const paths = LegacyOAuthRouter.getOAuthPaths();

      expect(paths).toContain(LEGACY_OAUTH_PATHS.WELL_KNOWN);
      expect(paths).toContain(LEGACY_OAUTH_PATHS.AUTHORIZE);
      expect(paths).toContain(LEGACY_OAUTH_PATHS.TOKEN);
      expect(paths).toContain(LEGACY_OAUTH_PATHS.REGISTER);
      expect(paths).toContain("/oauth/callback");
      expect(paths).toHaveLength(5);
    });
  });
});
