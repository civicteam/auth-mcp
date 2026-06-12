import { CLIAuthProvider, CLIClient, RestartableStreamableHTTPClientTransport } from "@civic/auth-mcp/client";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? "http://localhost:33007/mcp";

async function main() {
  // Check for required environment variables
  if (!process.env.OAUTH_CLIENT_ID && !process.env.OAUTH_CLIENT_METADATA_URL) {
    throw new Error("Either OAUTH_CLIENT_ID or OAUTH_CLIENT_METADATA_URL environment variable is required");
  }

  // Create the auth provider. A pre-registered client ID takes precedence;
  // otherwise the hosted Client ID Metadata Document URL is used as the
  // client_id (CIMD), falling back to Dynamic Client Registration if the
  // authorization server does not support CIMD.
  const authProvider = new CLIAuthProvider({
    clientId: process.env.OAUTH_CLIENT_ID,
    clientMetadataUrl: process.env.OAUTH_CLIENT_METADATA_URL,
  });

  // Create the transport with auth provider
  const serverUrl = new URL(MCP_SERVER_URL);
  const transport = new RestartableStreamableHTTPClientTransport(serverUrl, { authProvider });

  // Create and connect client with built-in auth handling
  const mcpClient = new CLIClient({ name: "cli-example", version: "0.0.1" }, { capabilities: {} });

  console.log("Connecting...");
  // Connect to the server - this will trigger auth if needed
  await mcpClient.connect(transport);
  console.log("Connected.");

  const tools = await mcpClient.listTools();
  console.log("Available tools:", tools);

  const result = await mcpClient.callTool({
    name: "whoami",
    arguments: {},
  });

  console.log((result.content as [{ text: string }])[0].text);

  // Close the client connection
  await mcpClient.close();
}

main();
