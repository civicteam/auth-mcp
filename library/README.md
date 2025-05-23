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
- Framework-agnostic core for use with any nodejs framework
- CLI authentication for integration with command-line tools

## 🚀 Quick Start

 Install the dependencies:

```bash
npm install @civic/auth-mcp @modelcontextprotocol/sdk
```

Add the middleware to your express app:

```typescript
app.use(await auth());
```

That's it!

## 🛠️ Usage Examples

### 🚀 Express Middleware (Recommended)

The fastest way to secure an MCP server. Works smoothly with [Anthropic's SDK](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

```typescript
import { auth } from "@civic/auth-mcp";

// Create your MCP server
const mcpServer = new Server({
  name: "weather-mcp-server",
  version: "0.0.1",
});

// Register your tools
mcpServer.tool(/* your tool details */);

// Add auth middleware
app.use(await auth());

// In production you would need session management
const transport = new StreamableHTTPServerTransport();

// Set up MCP endpoint
app.post("/mcp", async (req, res) => {
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

### ⚙️ Configuration Options

```typescript
// Use a different auth server:
app.use(await auth({
  wellKnownUrl: 'https://accounts.google.com/.well-known/openid-configuration'
}));

// Or specify additional options
app.use(await auth({
  issuerUrl: 'https://my-mcp-server.com',
  scopesSupported: ['openid', 'profile', 'email', 'custom:scope']
}));
```

### ⚡ Framework-Agnostic Usage

For non-Express frameworks, use the `McpServerAuth` class directly:

```typescript
import { McpServerAuth } from "@civic/auth-mcp";

// Initialize the auth server
const mcpServerAuth = await McpServerAuth.init();

// In your framework's route handler:
// 1. Expose the protected resource metadata
if (path === '/.well-known/oauth-protected-resource') {
  const metadata = mcpServerAuth.getProtectedResourceMetadata('https://my-server.com');
  return json(metadata);
}

// 2. Validate bearer tokens
const token = McpServerAuth.extractBearerToken(authHeader);
if (!token) {
  return unauthorized('Missing bearer token');
}

const authInfo = await mcpServerAuth.verifyToken(token);
if (!authInfo) {
  return unauthorized('Invalid token');
}

// Use authInfo.clientId, authInfo.scopes, authInfo.extra.email, etc.
```

## 💻 Client Integration

### 🖥️ CLI Client

```typescript
import { CLIAuthProvider, RestartableStreamableHTTPClientTransport, CLIClient } from "@civic/auth-mcp/client";

// Create the auth provider
const authProvider = new CLIAuthProvider({
  clientId: "your-client-id", // Get your client ID from auth.civic.com
  // clientSecret: "your-secret", // Optional: only for non-PKCE auth servers
});

// Create the transport with auth provider
const transport = new RestartableStreamableHTTPClientTransport(
  new URL("http://localhost:33006/mcp"),
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
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Create with pre-obtained token
const authProvider = new TokenAuthProvider("your-jwt-token");

// Create transport and client
const transport = new RestartableStreamableHTTPClientTransport(
  new URL("http://localhost:33006/mcp"),
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
- One-line integration 

**🔒 Enterprise Security, Startup Speed**
- Works seamlessly with Civic Auth, a battle-tested and secure authentication provider
- Automatic token refresh and session management
- Privacy-first design with minimal data collection
- PKCE-support

**🎯 Developer Experience First**
- CLI authentication with automatic browser flow
- Multiple auth patterns: tokens, OAuth flow, pre-authenticated
- TypeScript-first with comprehensive type safety

**🌐 Production Ready**
- Comprehensive error handling and retry logic
- Built-in transport layer with connection recovery
- Lightweight with minimal dependencies

---

## 🌟 What's Next?

- 📚 **Documentation**: Comprehensive guides at [docs.civic.com](https://docs.civic.com)
- 🐛 **Issues**: Report bugs or request features on [GitHub](https://github.com/civicteam/auth-mcp)
- 💬 **Community**: Join our Discord for support and discussions
- 🔄 **Updates**: Follow [@civickey](https://twitter.com/civickey) for the latest updates

## 📄 License

MIT License