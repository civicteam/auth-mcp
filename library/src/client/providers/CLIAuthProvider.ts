import { execFile } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import url from "node:url";
import { promisify } from "node:util";
import type { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientInformation, OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import escapeHtml from "escape-html";
import { DEFAULT_CALLBACK_PORT, DEFAULT_SCOPE } from "../../constants.js";
import { CivicAuthProvider, type CivicAuthProviderOptions } from "./CivicAuthProvider.js";

export interface CLIAuthProviderOptions extends CivicAuthProviderOptions {
  clientId: string;
  scope?: string;
  callbackPort?: number;
}

/**
 * CLI Auth Provider for MCP
 * Opens authorization URL in default browser and stores tokens in memory
 */
export class CLIAuthProvider extends CivicAuthProvider {
  private storedCodeVerifier: string | undefined;
  private clientId: string;
  private scope: string;
  private callbackPort: number;
  private callbackServer: http.Server | undefined;
  private authorizationCodePromise: Promise<string> | undefined;
  private authorizationCodeResolve: ((code: string) => void) | undefined;
  private authorizationCodeReject: ((error: Error) => void) | undefined;
  private transport: SSEClientTransport | StreamableHTTPClientTransport | undefined;

  constructor(options: CLIAuthProviderOptions) {
    super(options);
    this.clientId = options.clientId;
    this.scope = options.scope || DEFAULT_SCOPE;
    this.callbackPort = options.callbackPort || DEFAULT_CALLBACK_PORT;
  }

  clientInformation(): OAuthClientInformation | Promise<OAuthClientInformation | undefined> | undefined {
    const info: OAuthClientInformation = {
      client_id: this.clientId,
    };

    // Include client_secret if provided (for non-PKCE auth servers)
    if (this.clientSecret) {
      info.client_secret = this.clientSecret;
    }

    return info;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [`http://localhost:${this.callbackPort}/callback`],
      client_name: this.clientId,
      scope: this.scope,
    };
  }

  codeVerifier(): string | Promise<string> {
    // Generate and return the stored code verifier
    if (!this.storedCodeVerifier) {
      this.storedCodeVerifier = crypto.randomBytes(32).toString("base64url");
    }
    return this.storedCodeVerifier;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    console.log(`Opening authorization URL in browser: ${authorizationUrl.href}`);

    // Start the callback server before opening the browser
    await this.startCallbackServer();

    // Open URL in default browser
    await this.openInBrowser(authorizationUrl.href);

    console.log("Please complete the authorization in your browser.");
  }

  /**
   * Registers the transport with the auth provider so that we can call finishAuth when the code is received.
   * @param transport
   */
  registerTransport(transport: SSEClientTransport | StreamableHTTPClientTransport): void {
    this.transport = transport;
  }

  get redirectUrl(): string | URL {
    // Return the redirect URL for the OAuth flow
    return new URL(`http://localhost:${this.callbackPort}/callback`);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.storedCodeVerifier = codeVerifier;
  }

  /**
   * Starts a local HTTP server to handle the OAuth callback
   */
  private async startCallbackServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create a promise for the authorization code
      this.authorizationCodePromise = new Promise((resolveCode, rejectCode) => {
        this.authorizationCodeResolve = resolveCode;
        this.authorizationCodeReject = rejectCode;
      });

      this.callbackServer = http.createServer((req, res) => {
        if (!req.url) {
          res.writeHead(400);
          res.end("Bad Request");
          return;
        }

        const parsedUrl = url.parse(req.url, true);

        if (parsedUrl.pathname === "/callback") {
          const code = parsedUrl.query.code as string;
          const error = parsedUrl.query.error as string;

          if (error) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<html lang="en"><body><h1>Authorization Failed</h1><p>${escapeHtml(error)}</p></body></html>`);

            if (this.authorizationCodeReject) {
              this.authorizationCodeReject(new Error(`OAuth error: ${error}`));
            }

            this.stopCallbackServer();
          } else if (code) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(
              '<html lang="en"><body><h1>Authorization Successful</h1><p>You can now close this window.</p></body></html>'
            );

            // Call finishAuth on the transport if set. This triggers the token exchange
            if (this.transport) {
              this.transport
                .finishAuth(code)
                .then(() => this.stopCallbackServer())
                .then(() => this.authorizationCodeResolve?.(code))
                .catch((error) => {
                  console.error("Error in finishAuth:", error);
                  this.authorizationCodeReject?.(error);
                });
            } else {
              this.authorizationCodeReject?.(new Error("No transport registered"));
            }
          } else {
            res.writeHead(400);
            res.end("Missing authorization code");
          }
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      });

      this.callbackServer.listen(this.callbackPort, () => {
        console.log(`Callback server listening on http://localhost:${this.callbackPort}`);
        resolve();
      });

      this.callbackServer.on("error", reject);
    });
  }

  /**
   * Stops the callback server
   */
  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = undefined;
    }
  }

  /**
   * Waits for the authorization code from the callback
   */
  async waitForAuthorizationCode(): Promise<string> {
    if (!this.authorizationCodePromise) {
      throw new Error("Authorization flow not started");
    }
    return this.authorizationCodePromise;
  }

  private async openInBrowser(url: string): Promise<void> {
    const execFileAsync = promisify(execFile);

    try {
      switch (process.platform) {
        case "darwin":
          await execFileAsync("open", [url]);
          break;
        case "win32":
          await execFileAsync("cmd", ["/c", "start", url]);
          break;
        default:
          // Linux/Unix
          await execFileAsync("xdg-open", [url]);
      }
    } catch (error) {
      console.error("Failed to open browser:", error);
      console.log("Please open this URL manually:", url);
    }
  }
}
