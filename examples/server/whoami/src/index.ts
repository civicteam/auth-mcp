import express from "express";
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {randomUUID} from "node:crypto";
import {civicAuth} from "@civic/auth-mcp/server/express";

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT) : 33007;

// Create Express app
const app = express();
app.use(express.json());

// Create MCP server
const mcpServer = new McpServer({
    name: "whoami-mcp-server",
    version: "0.0.1",
});

// Define a whoami tool
mcpServer.tool(
    "whoami",
    "Get information about the current user",
    {},
    async (_, extra ) => {
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

// Add Civic auth middleware
app.use(await civicAuth({
    redirectUris: ["http://localhost:8080/callback"],
    issuerUrl: new URL(`http://localhost:${PORT}`),
}));

// In production you would need session management
const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID()
});
await mcpServer.connect(transport);

// Handle MCP requests via HTTP
app.post("/mcp", async (req, res) => {
    await transport.handleRequest(req, res, req.body);
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`MCP server with Civic Auth running at http://localhost:${PORT}`);
    console.log(`Auth endpoints available at http://localhost:${PORT}/auth`);
});