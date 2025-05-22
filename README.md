# @civic/auth-mcp

Authentication for Model Context Protocol (MCP) servers and clients. This package provides a complete authentication solution for MCP, allowing easy integration with Civic's authentication service.

## Features

- **Server-side Integration**:
  - Express middleware for easy setup
  - Framework-agnostic OAuth provider
  - FastMCP integration
  - OAuth endpoints that forward to Civic's auth service

- **Client-side Integration**:
  - CLI authentication flow with browser redirection
  - Token-based authentication
  - Client credentials flow for server-to-server auth
  - Browser-based authentication with customizable UI

## Installation

```bash
npm install @civic/auth-mcp @modelcontextprotocol/sdk
# or
yarn add @civic/auth-mcp @modelcontextprotocol/sdk
# or
pnpm add @civic/auth-mcp @modelcontextprotocol/sdk
```

## Server-side Usage

### Express Middleware

```typescript
import { civicAuth } from "@civic/auth-mcp/server/express";

// Create the MCP server
const mcpServer = new Server({
  name: "weather-mcp-server",
  version: "0.0.1",
});

// Register your tools
mcpServer.tool(/* tool details */);

// Add Civic auth middleware
app.use(await civicAuth({
  redirectUris: ["http://localhost:8080/callback"],
  issuerUrl: new URL("http://localhost:33006"),
}));

// Set up MCP endpoint
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport();
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

### Framework-agnostic Provider

```typescript
import { createCivicOAuthProvider } from "@civic/auth-mcp/server";

const mcpServer = new Server({
  name: "weather-mcp-server",
  version: "0.0.1",
});

// Create the Civic OAuth provider
const oauthProvider = await createCivicOAuthProvider({
  redirectUris: ["http://localhost:8080/callback"],
});

// Express example - note if using express, it is easier to use the civicAuth middleware in the previous example.
// This uses the express-specific mcpAuthRouter provided by @modelcontextprotocol/sdk.
// other examples using, eg., hono to follow.
app.use(mcpAuthRouter({
  provider: oauthProvider,
  issuerUrl: new URL("http://localhost:33006"),
  serviceDocumentationUrl: new URL("https://docs.civic.com/"),
}));

app.use(requireBearerAuth({
  provider: oauthProvider,
}));
```

## Client-side Usage

### CLI Client Integration

```typescript
import { CLIAuthProvider, RestartableStreamableHTTPClientTransport } from "@civic/auth-mcp/client";

// Create the auth provider
const authProvider = new CLIAuthProvider({
  clientId: "your-client-id",
  scope: "openid profile email",
  callbackPort: 8080,
});

// Create the transport with auth provider
const transport = new RestartableStreamableHTTPClientTransport(
  new URL("http://localhost:33006"),
  { authProvider }
);

// Create and connect client
const mcpClient = new CLIClient(
    { name: "cli-example", version: "0.0.1" }, 
    { capabilities: {} }
);

// Connect to the server
await mcpClient.connect(transport);
```

### Token Authentication

```typescript
import { TokenAuthProvider, RestartableStreamableHTTPClientTransport } from "@civic/auth-mcp/client";

// Create with pre-obtained tokens
const authProvider = new TokenAuthProvider({
  tokens: {
    accessToken: "your-access-token",
    refreshToken: "your-refresh-token",
    idToken: "your-id-token",
  }
});

// Create transport and client
const transport = new RestartableStreamableHTTPClientTransport(
  new URL("http://localhost:33006"),
  { authProvider }
);

const mcpClient = new Client(
  { name: "example-client", version: "0.0.1" },
  { capabilities: {} }
);

await mcpClient.connect(transport);
```

## License

This package is licensed under the MIT License.