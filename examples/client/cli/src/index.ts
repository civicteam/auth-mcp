import * as dotenv from 'dotenv';
import {RestartableStreamableHTTPClientTransport, CLIAuthProvider, CLIClient} from '@civic/auth-mcp/client';

// Load environment variables
dotenv.config();

async function main() {
    // Check for required environment variables
    if (!process.env.OAUTH_CLIENT_ID) {
        throw new Error('OAUTH_CLIENT_ID environment variable is required');
    }

    // Create the auth provider
    const authProvider = new CLIAuthProvider({
        clientId: process.env.OAUTH_CLIENT_ID,
    });

    // Create the transport with auth provider
    const serverUrl = new URL("http://localhost:33007/mcp");
    const transport = new RestartableStreamableHTTPClientTransport(
        serverUrl,
        {authProvider}
    );

    // Create and connect client with built-in auth handling
    const mcpClient = new CLIClient(
        {name: "cli-example", version: "0.0.1"},
        {capabilities: {}}
    );

    console.log("Connecting...")
    // Connect to the server - this will trigger auth if needed
    await mcpClient.connect(transport);
    console.log("Connected.")

    const result = await mcpClient.callTool({
        name: 'whoami',
        arguments: {}
    });

    console.log("\nTool result:", result);

    // Close the client connection
    await mcpClient.close();
    console.log("\nClient connection closed");
}

main();