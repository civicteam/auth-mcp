import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ExtendedAuthInfo, OIDCWellKnownConfiguration } from "../types.js";
import { OAUTH_ERRORS } from "./constants.js";
import { InMemoryStateStore } from "./StateStore.js";
import type {
  AuthorizationRequest,
  LegacyOAuthOptions,
  OAuthErrorResponse,
  OAuthState,
  StateStore,
  TokenRequest,
} from "./types.js";

/**
 * Handles OAuth endpoint proxying for legacy mode
 */
export class OAuthProxyHandler<TAuthInfo extends ExtendedAuthInfo, TRequest extends IncomingMessage = IncomingMessage> {
  private stateStore: StateStore;
  private options: LegacyOAuthOptions<TAuthInfo, TRequest>;
  private oidcConfig: OIDCWellKnownConfiguration;

  constructor(options: LegacyOAuthOptions<TAuthInfo, TRequest>, oidcConfig: OIDCWellKnownConfiguration) {
    this.options = options;
    this.oidcConfig = oidcConfig;
    this.stateStore = options.stateStore || new InMemoryStateStore();
  }

  /**
   * Handle authorization endpoint requests
   */
  async handleAuthorize(req: TRequest, res: ServerResponse): Promise<void> {
    try {
      if (!req.url) {
        throw new Error("Request URL is missing");
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const params = url.searchParams;

      // Extract authorization request parameters
      const authRequest: AuthorizationRequest = {
        response_type: params.get("response_type") || "",
        client_id: params.get("client_id") || "",
        redirect_uri: params.get("redirect_uri") || "",
        state: params.get("state") || undefined,
        scope: params.get("scope") || undefined,
        code_challenge: params.get("code_challenge") || undefined,
        code_challenge_method: params.get("code_challenge_method") || undefined,
      };

      // Validate required parameters
      if (!authRequest.response_type || !authRequest.client_id || !authRequest.redirect_uri) {
        return this.sendErrorRedirect(res, authRequest.redirect_uri, {
          error: OAUTH_ERRORS.INVALID_REQUEST,
          error_description: "Missing required parameters",
          state: authRequest.state,
        });
      }

      // Only support authorization code flow
      if (authRequest.response_type !== "code") {
        return this.sendErrorRedirect(res, authRequest.redirect_uri, {
          error: OAUTH_ERRORS.UNSUPPORTED_RESPONSE_TYPE,
          error_description: "Only 'code' response type is supported",
          state: authRequest.state,
        });
      }

      // Generate state for tracking this authorization
      const internalState = this.generateState();

      // Store the original request details
      const stateData: OAuthState = {
        redirectUri: authRequest.redirect_uri,
        clientState: authRequest.state,
        codeChallenge: authRequest.code_challenge,
        codeChallengeMethod: authRequest.code_challenge_method,
        createdAt: Date.now(),
        scope: authRequest.scope,
        clientId: authRequest.client_id,
      };

      await this.stateStore.set(internalState, stateData);

      // Build redirect to actual auth server
      const authUrl = new URL(this.oidcConfig.authorization_endpoint);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", this.options.clientId || authRequest.client_id);
      authUrl.searchParams.set("redirect_uri", this.getMcpCallbackUrl(req));
      authUrl.searchParams.set("state", internalState);

      if (authRequest.scope) {
        authUrl.searchParams.set("scope", authRequest.scope);
      }

      // Forward PKCE parameters if provided
      if (authRequest.code_challenge) {
        authUrl.searchParams.set("code_challenge", authRequest.code_challenge);
        if (authRequest.code_challenge_method) {
          authUrl.searchParams.set("code_challenge_method", authRequest.code_challenge_method);
        }
      }

      // Redirect to auth server
      res.writeHead(302, { Location: authUrl.toString() });
      res.end();
    } catch (error) {
      console.error("Error handling authorize request:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: OAUTH_ERRORS.SERVER_ERROR }));
    }
  }

  /**
   * Handle OAuth callback from auth server
   */
  async handleCallback(req: TRequest, res: ServerResponse): Promise<void> {
    try {
      if (!req.url) {
        throw new Error("Request URL is missing");
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const params = url.searchParams;

      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");

      if (!state) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: OAUTH_ERRORS.INVALID_REQUEST }));
        return;
      }

      // Retrieve stored state
      const stateData = await this.stateStore.get(state);
      if (!stateData) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: OAUTH_ERRORS.INVALID_REQUEST, error_description: "Invalid state" }));
        return;
      }

      // Clean up state
      await this.stateStore.delete(state);

      // If there was an error from auth server, forward it
      if (error) {
        return this.sendErrorRedirect(res, stateData.redirectUri, {
          error: error,
          error_description: params.get("error_description") || undefined,
          error_uri: params.get("error_uri") || undefined,
          state: stateData.clientState,
        });
      }

      if (!code) {
        return this.sendErrorRedirect(res, stateData.redirectUri, {
          error: OAUTH_ERRORS.INVALID_REQUEST,
          error_description: "Missing authorization code",
          state: stateData.clientState,
        });
      }

      // Redirect back to original client with the code
      const redirectUrl = new URL(stateData.redirectUri);
      redirectUrl.searchParams.set("code", code);
      if (stateData.clientState) {
        redirectUrl.searchParams.set("state", stateData.clientState);
      }

      res.writeHead(302, { Location: redirectUrl.toString() });
      res.end();
    } catch (error) {
      console.error("Error handling callback:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: OAUTH_ERRORS.SERVER_ERROR }));
    }
  }

  /**
   * Handle token endpoint requests
   */
  async handleToken(req: TRequest, res: ServerResponse): Promise<void> {
    try {
      let tokenRequest: TokenRequest;

      // Check if Express has already parsed the body
      if ("body" in req && req.body) {
        // Express has parsed the body (likely as JSON)
        tokenRequest = req.body as TokenRequest;
      } else {
        // Parse as form-encoded
        const body = await this.parseRequestBody(req);
        tokenRequest = {
          grant_type: body.get("grant_type") || "",
          code: body.get("code") || undefined,
          redirect_uri: body.get("redirect_uri") || undefined,
          client_id: body.get("client_id") || undefined,
          client_secret: body.get("client_secret") || undefined,
          code_verifier: body.get("code_verifier") || undefined,
          refresh_token: body.get("refresh_token") || undefined,
          scope: body.get("scope") || undefined,
        };
      }

      // Validate grant type
      if (!tokenRequest.grant_type) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: OAUTH_ERRORS.INVALID_REQUEST }));
        return;
      }

      // Forward the token request to the actual auth server
      const tokenResponse = await fetch(this.oidcConfig.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: tokenRequest.grant_type,
          ...(tokenRequest.code && { code: tokenRequest.code }),
          ...(tokenRequest.redirect_uri && { redirect_uri: this.getMcpCallbackUrl(req) }),
          ...(tokenRequest.client_id && { client_id: this.options.clientId || tokenRequest.client_id }),
          ...(tokenRequest.client_secret && { client_secret: tokenRequest.client_secret }),
          ...(tokenRequest.code_verifier && { code_verifier: tokenRequest.code_verifier }),
          ...(tokenRequest.refresh_token && { refresh_token: tokenRequest.refresh_token }),
          ...(tokenRequest.scope && { scope: tokenRequest.scope }),
        }).toString(),
      });

      const contentType = tokenResponse.headers.get("content-type") || "";
      const responseBody = await tokenResponse.text();

      // Forward the response
      res.writeHead(tokenResponse.status, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      });
      res.end(responseBody);
    } catch (error) {
      console.error("Error handling token request:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: OAUTH_ERRORS.SERVER_ERROR }));
    }
  }

  /**
   * Handle registration endpoint requests
   */
  async handleRegistration(req: TRequest, res: ServerResponse): Promise<void> {
    try {
      if (!this.oidcConfig.registration_endpoint) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Registration not supported" }));
        return;
      }

      let bodyObj: { scope?: string };

      // Check if Express has already parsed the body
      if ("body" in req && req.body) {
        // Express has already parsed the body
        bodyObj = req.body as { scope?: string };
      } else {
        // Need to read the raw body
        const contentType = req.headers["content-type"] || "";

        if (contentType.includes("application/json")) {
          // For JSON requests, read the raw body
          const rawBody = await this.readRawBody(req);
          bodyObj = JSON.parse(rawBody);
        } else {
          // For form-encoded, parse and reconstruct
          const parsed = await this.parseRequestBody(req);
          bodyObj = Object.fromEntries(parsed);
        }
      }

      // Replace the scope with the fixed set of scopes to avoid registration errors
      console.log(`Replacing requested scopes "${bodyObj.scope}" with "openid email profile"`);
      bodyObj.scope = "openid email profile";

      // Forward the registration request to the actual auth server
      const registrationResponse = await fetch(this.oidcConfig.registration_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyObj),
      });

      const responseContentType = registrationResponse.headers.get("content-type") || "";
      const responseBody = await registrationResponse.text();

      // Forward the response
      res.writeHead(registrationResponse.status, {
        "Content-Type": responseContentType,
      });
      res.end(responseBody);
    } catch (error) {
      console.error("Error handling registration request:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: OAUTH_ERRORS.SERVER_ERROR }));
    }
  }

  /**
   * Get the callback URL for the MCP server
   */
  private getMcpCallbackUrl(req: TRequest): string {
    // Express adds protocol property, otherwise default to http, unless forceHttps is set
    const protocol = this.options.forceHttps ? "https" : "protocol" in req ? req.protocol : "http";
    const host = req.headers.host;
    return `${protocol}://${host}/oauth/callback`;
  }

  /**
   * Generate a cryptographically secure state parameter
   */
  private generateState(): string {
    return randomBytes(32).toString("base64url");
  }

  /**
   * Send an error redirect response
   */
  private sendErrorRedirect(res: ServerResponse, redirectUri: string, error: OAuthErrorResponse): void {
    if (!redirectUri) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(error));
      return;
    }

    const url = new URL(redirectUri);
    url.searchParams.set("error", error.error);
    if (error.error_description) {
      url.searchParams.set("error_description", error.error_description);
    }
    if (error.error_uri) {
      url.searchParams.set("error_uri", error.error_uri);
    }
    if (error.state) {
      url.searchParams.set("state", error.state);
    }

    res.writeHead(302, { Location: url.toString() });
    res.end();
  }

  /**
   * Parse request body from incoming request
   */
  private async parseRequestBody(req: TRequest): Promise<URLSearchParams> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          resolve(new URLSearchParams(body));
        } catch (error) {
          reject(error);
        }
      });
      req.on("error", reject);
    });
  }

  /**
   * Read raw body from request
   */
  private async readRawBody(req: TRequest): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        resolve(body);
      });
      req.on("error", reject);
    });
  }
}
