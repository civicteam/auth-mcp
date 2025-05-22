# @civic/auth-mcp

🔐 **The Fastest Way to Add Authorization to MCP Servers**

This is the fastest way to add authorization to MCP servers, enabling secure tool use in LLMs and providing confidence and security for you and your customers.

It works with any compliant OAuth2/OIDC provider, while being optimized for Civic Auth's lightning-fast authentication experience.

## 🚀 Why Choose Civic Auth?

**Civic Auth** delivers the fastest, most flexible authentication experience for modern applications:

- **⚡ Lightning Setup**: Get users authenticated in under 60 seconds with familiar sign-in options (email, Google, passkeys, wallets)
- **🔄 Adaptable Onboarding**: Seamless experience for all users - supports existing wallets or creates embedded wallets automatically
- **🌐 Web3 Support**: Native support for Solana, Ethereum, Base, Polygon, BSC, Arbitrum, and other EVM chains
- **📱 Universal Compatibility**: Works everywhere - React, Next.js, Node.js, or any OIDC/OAuth 2.0 environment

*Ready to experience the fastest auth? Get your Client ID at [auth.civic.com](https://auth.civic.com) and be up and running in minutes.*

## 📦 Features

- Client and server SDKs for easy integration
- Express middleware for quick setup
- Framework-agnostic OAuth provider
- CLI authentication for integration with command-line tools

## 🚀 Quick Start

```bash
npm install @civic/auth-mcp @modelcontextprotocol/sdk
```

## 🛠️ Usage Examples

### 🚀 Express Middleware (Recommended)

The fastest way to secure an MCP server. Works smoothly with [Anthropic's SDK](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

```typescript
import { civicAuth } from "@civic/auth-mcp/server/express";

// Create the MCP server
const mcpServer = new Server({
  name: "weather-mcp-server",
  version: "0.0.1",
});

// Register your tools
mcpServer.tool(/* your tool details */);

// Add Civic auth middleware
app.use(await civicAuth({
  redirectUris: ["http://localhost:8080/callback"],
  issuerUrl: new URL("http://localhost:33006"),
}));

// In production you would need session management
const transport = new StreamableHTTPServerTransport();

// Set up MCP endpoint
app.post("/mcp", async (req, res) => {
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

### ⚡ Framework-Agnostic Provider

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

## 💻 Client Integration

### 🖥️ CLI Client

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

### 🎫 Token Authentication

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

---

## ✨ Why Choose @civic/auth-mcp?

**🚀 Zero-Friction Setup**
- Drop-in Express middleware that works out of the box
- Framework-agnostic OAuth provider for maximum flexibility
- Native FastMCP integration for lightning-fast development

**🔒 Enterprise Security, Startup Speed**
- Works seamlessly with Civic-Auth, a battle-tested and secure authentication provider
- Automatic token refresh and session management
- Privacy-first design with minimal data collection

**🎯 Developer Experience First**
- CLI authentication with automatic browser flow
- Multiple auth patterns: tokens, client credentials, browser-based
- TypeScript-first with comprehensive type safety

**🌐 Production Ready**
- Comprehensive error handling and retry logic
- Built-in transport layer with connection recovery
- 
---

## 🌟 What's Next?

- 📚 **Documentation**: Comprehensive guides at [docs.civic.com](https://docs.civic.com)
- 🐛 **Issues**: Report bugs or request features on [GitHub](https://github.com/civicteam/auth-mcp)
- 💬 **Community**: Join our Discord for support and discussions
- 🔄 **Updates**: Follow [@civickey](https://twitter.com/civickey) for the latest updates

## 📄 License

MIT License