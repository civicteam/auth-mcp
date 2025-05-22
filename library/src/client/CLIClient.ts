import {
	Client,
	ClientOptions,
} from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
	ClientResult,
	Implementation,
} from "@modelcontextprotocol/sdk/types.js";
import type { CLIAuthProvider } from "./providers/index.js";
import { RestartableStreamableHTTPClientTransport } from "./transport/index.js";

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
	async connect(
		transport: RestartableStreamableHTTPClientTransport,
	): Promise<void> {
		try {
			console.log("Connecting to MCP server...");
			await super.connect(transport);
		} catch (error: unknown) {
			console.log("Error connecting to MCP server:", error);
			// Check if this is an authorization error
			if (error instanceof Error) {
				if (error.message === "Unauthorized") {
					console.log(
						"Authorization required, waiting for user to complete OAuth flow...",
					);
					const authProvider = transport.authProvider;

					// only wait if the tokens have not been set already
					if (!authProvider.tokens()) {
						console.log("Waiting for authorization code...");
						// Wait for the OAuth flow to complete
						await authProvider.waitForAuthorizationCode();
						console.log("Authorization completed.");

						// Retry the connection - the auth provider now has tokens
						return await super.connect(transport);
					} else {
						console.log(
							"Authorization already completed, but still unauthorized.",
						);
					}
				}
			}

			// Re-throw any other errors
			console.log("Re-throwing error:", error);
			throw error;
		}
	}
}
