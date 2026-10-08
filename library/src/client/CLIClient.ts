import { Client, type ClientOptions, type Implementation, UnauthorizedError } from "@modelcontextprotocol/client";
import type { RestartableStreamableHTTPClientTransport } from "./transport/index.js";

/**
 * MCP Client with built-in CLI authentication support
 * Handles the OAuth flow automatically and retries connection after auth
 */
export class CLIClient extends Client {
  /**
   * @param clientInfo Name and version of this client, sent to the server on connect.
   * @param options Client options. Protocol version negotiation defaults to `auto` so the
   *   client probes `server/discover` (protocol revision 2026-07-28) and falls back to
   *   `initialize` for servers on earlier revisions. Pass `versionNegotiation` to override.
   */
  constructor(clientInfo: Implementation, options?: ClientOptions) {
    super(clientInfo, { versionNegotiation: { mode: "auto" }, ...options });
  }

  /**
   * Connect to MCP server with automatic authentication handling
   * If the first connection fails due to auth, it will wait for the OAuth flow
   * to complete and then retry the connection
   */
  async connect(transport: RestartableStreamableHTTPClientTransport): Promise<void> {
    try {
      await super.connect(transport);
    } catch (error: unknown) {
      // The transport throws UnauthorizedError when auth() in @modelcontextprotocol/client
      // returns "REDIRECT", i.e. the user has been sent to the authorization server.
      // Wait for the callback to deliver the code, then connect again.
      if (error instanceof UnauthorizedError) {
        console.log("Authorization required, waiting for user to complete OAuth flow...");
        const authProvider = transport.authProvider;

        // Wait for the OAuth flow to complete
        await authProvider.waitForAuthorizationCode();
        console.log("Authorization completed.");

        // Retry the connection - the auth provider now has tokens
        return await super.connect(transport);
      }

      // Re-throw any other errors
      throw error;
    }
  }
}
