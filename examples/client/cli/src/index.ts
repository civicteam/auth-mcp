import { CLIAuthProvider, CLIClient, RestartableStreamableHTTPClientTransport } from "@civic/auth-mcp/client";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? "http://localhost:33007/mcp";

async function main() {
  // Check for required environment variables
  if (!process.env.OAUTH_CLIENT_ID) {
    throw new Error("OAUTH_CLIENT_ID environment variable is required");
  }

  // Create the auth provider
  const authProvider = new CLIAuthProvider({
    clientId: process.env.OAUTH_CLIENT_ID,
    useIDToken: true,
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

  const result = await mcpClient.callTool({
    name: "whoami",
    arguments: {},
  });

  console.log((result.content as [{ text: string }])[0].text);

  // Close the client connection
  await mcpClient.close();
}

main();
