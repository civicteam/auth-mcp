import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { auth } from "@civic/auth-mcp";

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT) : 33007;

// Create Express app
const app = express();

// Create MCP server
const mcpServer = new McpServer({
    name: "whoami-mcp-server",
    version: "1.0.0",
});

// Define a whoami tool
mcpServer.tool(
    "whoami",
    "Get information about the current user",
    {},
    async (_, extra) => {
        const user = extra.authInfo?.extra?.name ?? extra.authInfo?.extra?.sub;
        return {
            content: [
                {
                    type: "text",
                    text: `Hello ${user}!`,
                },
            ],
        };
    }
);

app.use(await auth());

// In production you would need session management
const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID()
});
await mcpServer.connect(transport);

// Handle MCP requests via HTTP
app.post("/mcp", async (req, res) => {
    await transport.handleRequest(req, res);
});


// Start the Express server
app.listen(PORT, () => {
    console.log(`MCP server with Civic Auth running at http://localhost:${PORT}`);
    console.log(`OAuth metadata available at http://localhost:${PORT}/.well-known/oauth-protected-resource`);
    console.log(`\nMCP clients will authenticate directly with Civic Auth!`);
});