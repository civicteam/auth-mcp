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

## 📚 Documentation

Full documentation and usage examples are available in the [`library/`](./library/) package.

## 📄 License

It is provided **as-is**, without warranty of any kind, express or implied. Civic makes **no guarantees of fitness for a particular purpose or ongoing support**.
Use of this library is governed solely by the terms of the MIT License.

By using this software, you agree that Civic shall not be held liable for any damages arising from its use, performance, or integration.

Note: The @civic/auth-mcp library is released as an open-source project under the **MIT License**.

It is provided without warranty or support guarantees.