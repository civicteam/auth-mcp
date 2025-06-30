# @civic/auth-mcp

[![CI](https://github.com/civicteam/auth-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/civicteam/auth-mcp/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40civic%2Fauth-mcp.svg)](https://www.npmjs.com/package/@civic/auth-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![codecov](https://codecov.io/gh/civicteam/auth-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/civicteam/auth-mcp)

🔐 **Authentication for Model Context Protocol** - Monorepo

This repository contains the Civic Auth MCP library and examples for adding secure authentication to MCP servers and clients.

## 📦 Packages

- **[`library/`](./library/)** - The main `@civic/auth-mcp` package ([npm](https://www.npmjs.com/package/@civic/auth-mcp))
- **[`examples/`](./examples/)** - Example implementations and demos

## 🚀 Quick Start

```bash
# Install the library
pnpm add @civic/auth-mcp @modelcontextprotocol/sdk

# Run examples
pnpm install
pnpm build
pnpm --filter example-server start
```

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint
```

## 🔒 Security Auditing

This project uses `audit-ci` for dependency vulnerability scanning in CI/CD. To manage security vulnerabilities:

- **Configuration**: Edit `audit-ci.jsonc` to add vulnerabilities to the allowlist
- **Run audit**: `pnpm run audit:ci` (fails on moderate+ vulnerabilities not in allowlist)
- **CI/CD**: Security audit runs automatically on all PRs and pushes to main

To allowlist a vulnerability, add its identifier to `audit-ci.jsonc`:
```jsonc
{
  "allowlist": [
    "GHSA-xxxx-xxxx-xxxx",  // GitHub Security Advisory
    "CVE-2024-xxxxx",       // CVE identifier
    "1234567"               // NPM advisory ID
  ]
}
```

## 📚 Documentation

Full documentation and usage examples are available in the [`library/`](./library/) package.

## 🚨 Legacy OAuth Mode

For backward compatibility, the `auth()` middleware automatically includes legacy OAuth endpoints that allow MCP servers to act as OAuth servers. This mode is **enabled by default** but is deprecated.

The following endpoints are automatically exposed:
- `/.well-known/oauth-authorization-server` - OAuth server metadata
- `/authorize` - Authorization endpoint (proxies to Civic Auth)
- `/token` - Token endpoint (proxies to Civic Auth)
- `/register` - Registration endpoint (if supported)

To disable legacy mode:
```typescript
app.use(await auth({
  enableLegacyOAuth: false  // Disable legacy OAuth endpoints
}));
```

## 📄 License

It is provided **as-is**, without warranty of any kind, express or implied. Civic makes **no guarantees of fitness for a particular purpose or ongoing support**.
Use of this library is governed solely by the terms of the MIT License.

By using this software, you agree that Civic shall not be held liable for any damages arising from its use, performance, or integration.

Note: The @civic/auth-mcp library is released as an open-source project under the **MIT License**.

It is provided without warranty or support guarantees.