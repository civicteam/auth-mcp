import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { RestartableStreamableHTTPClientTransport } from "./transport/index.js";

/**
 * MCP Client with built-in CLI authentication support
 * Handles the OAuth flow automatically and retries connection after auth
 */
export class CLIClient extends Client {
  /**
   * Connect to MCP server with automatic authentication handling
   * If the first connection fails due to auth, it will wait for the OAuth flow
   * to complete and then retry the connection
   */
  async connect(transport: RestartableStreamableHTTPClientTransport): Promise<void> {
    try {
      await super.connect(transport);
    } catch (error: unknown) {
      console.log("Error connecting to MCP server:", error);
      // Check if this is an authorization error
      if (error instanceof Error) {
        if (error.message === "Unauthorized") {
          console.log("Authorization required, waiting for user to complete OAuth flow...");
          const authProvider = transport.authProvider;

          // only wait if the tokens have not been set already
          if (!authProvider.tokens()) {
            // Wait for the OAuth flow to complete
            await authProvider.waitForAuthorizationCode();
            console.log("Authorization completed.");

            // Retry the connection - the auth provider now has tokens
            return await super.connect(transport);
          }
          console.log("Authorization already completed, but still unauthorized.");
        }
      }

      // Re-throw any other errors
      throw error;
    }
  }
}
