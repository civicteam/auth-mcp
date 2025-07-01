import type { Request, Response } from "express";
import { Router } from "express";
import type { CivicAuthOptions, ExtendedAuthInfo, OIDCWellKnownConfiguration } from "../types.js";
import {
  LEGACY_GRANT_TYPES,
  LEGACY_OAUTH_PATHS,
  LEGACY_RESPONSE_TYPES,
  LEGACY_TOKEN_AUTH_METHODS,
} from "./constants.js";
import { OAuthProxyHandler } from "./OAuthProxyHandler.js";

/**
 * Creates a router with legacy OAuth endpoints for backward compatibility
 */
export class LegacyOAuthRouter<TAuthInfo extends ExtendedAuthInfo> {
  private oauthHandler: OAuthProxyHandler<TAuthInfo, Request>;
  private oidcConfig: OIDCWellKnownConfiguration;
  private options: CivicAuthOptions<TAuthInfo, Request>;

  constructor(options: CivicAuthOptions<TAuthInfo, Request>, oidcConfig: OIDCWellKnownConfiguration) {
    this.options = options;
    this.oidcConfig = oidcConfig;
    this.oauthHandler = new OAuthProxyHandler(options, oidcConfig);
  }

  /**
   * Create and configure the legacy OAuth router
   */
  createRouter(): Router {
    const router = Router();

    // OAuth Authorization Server Metadata (legacy)
    router.get(LEGACY_OAUTH_PATHS.WELL_KNOWN, (req: Request, res: Response) => {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const metadata = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}${LEGACY_OAUTH_PATHS.AUTHORIZE}`,
        token_endpoint: `${baseUrl}${LEGACY_OAUTH_PATHS.TOKEN}`,
        registration_endpoint: this.oidcConfig.registration_endpoint
          ? `${baseUrl}${LEGACY_OAUTH_PATHS.REGISTER}`
          : undefined,
        scopes_supported: this.options.scopesSupported || this.oidcConfig.scopes_supported || [],
        response_types_supported: LEGACY_RESPONSE_TYPES,
        grant_types_supported: LEGACY_GRANT_TYPES,
        token_endpoint_auth_methods_supported: LEGACY_TOKEN_AUTH_METHODS,
        code_challenge_methods_supported: ["S256", "plain"],
      };
      res.json(metadata);
    });

    // Authorization endpoint
    router.get(LEGACY_OAUTH_PATHS.AUTHORIZE, async (req: Request, res: Response) => {
      await this.oauthHandler.handleAuthorize(req, res);
    });

    // OAuth callback
    router.get("/oauth/callback", async (req: Request, res: Response) => {
      await this.oauthHandler.handleCallback(req, res);
    });

    // Token endpoint
    router.post(LEGACY_OAUTH_PATHS.TOKEN, async (req: Request, res: Response) => {
      await this.oauthHandler.handleToken(req, res);
    });

    // Registration endpoint
    if (this.oidcConfig.registration_endpoint) {
      router.post(LEGACY_OAUTH_PATHS.REGISTER, async (req: Request, res: Response) => {
        await this.oauthHandler.handleRegistration(req, res);
      });
    }

    return router;
  }

  /**
   * Get the list of legacy OAuth paths for authentication bypass
   */
  static getOAuthPaths(): string[] {
    return [
      LEGACY_OAUTH_PATHS.WELL_KNOWN,
      LEGACY_OAUTH_PATHS.AUTHORIZE,
      LEGACY_OAUTH_PATHS.TOKEN,
      LEGACY_OAUTH_PATHS.REGISTER,
      "/oauth/callback",
    ];
  }
}
