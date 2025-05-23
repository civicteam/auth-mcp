# MCP SDK 1.12.0 Upgrade Proposal

## Executive Summary

The MCP SDK 1.12.0 enables ANY MCP server to use Civic Auth as its authorization server directly. This is a game-changer that allows us to transform auth-mcp into a simple configuration library.

## What's Now Possible

With the new SDK architecture:
- **Any MCP server can declare Civic Auth as its authorization server**
- **No proxy layer needed** - MCP clients will authenticate directly with Civic
- **auth-mcp becomes a thin configuration helper** for MCP servers

## How It Works

1. **MCP Server Setup**: Uses auth-mcp to configure itself as a resource server
2. **Discovery**: Server exposes `/.well-known/oauth-protected-resource` pointing to Civic Auth
3. **Authentication**: MCP clients authenticate directly with Civic Auth
4. **Token Validation**: Server validates tokens using Civic's JWKS

## The New auth-mcp Library

Instead of implementing OAuth flows, auth-mcp will simply provide:

### For MCP Server Developers
```typescript
import { useCivicAuth } from '@civic/auth-mcp';

// One line to add Civic Auth to any MCP server
app.use(useCivicAuth({
  // Optional: customize scopes, etc.
}));
```

This single middleware will:
- Configure the protected resource metadata endpoint
- Set up token validation using Civic's JWKS  
- Handle bearer token authentication
- Provide user info from validated tokens

## Proposed Simplification Strategy

### Option 1: Minimal Resource Server Only
- Implement only token validation using Civic's JWKS
- Configure the resource server to point to Civic's authorization endpoints
- Remove all proxy code and authorization flow implementations
- Result: A very thin library that just configures MCP to use Civic Auth

### Option 2: Hybrid Approach (if needed)
- Keep a thin authorization server wrapper for special cases
- But default to using Civic's auth server directly
- Useful if custom token enrichment or client management is needed

## Benefits

1. **Massive Simplification**: Remove 80%+ of current code
2. **Better Security**: Let Civic handle all OAuth flows directly
3. **Easier Maintenance**: Less code to maintain and update
4. **Better Performance**: No proxy overhead

## Migration Path

1. Verify that Civic's auth server supports all required MCP OAuth flows
2. Update to SDK 1.12.0 and fix interface changes
3. Implement minimal resource server configuration
4. Test direct integration with Civic's auth server
5. Remove proxy layer and unnecessary code

## Open Questions

1. Does Civic's auth server support all MCP-required OAuth flows?
2. Are there any MCP-specific requirements that would prevent direct integration?
3. Do we need any custom token enrichment that would require our own auth server?

## Recommendation

Pursue Option 1 (Minimal Resource Server Only) first. This aligns perfectly with the new SDK architecture and would result in a much simpler, more maintainable library that acts as a thin configuration layer between MCP servers and Civic Auth.