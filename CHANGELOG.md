# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] - 2025-09-05

### Added
- Path-based client ID for dynamic client registration - client ID is now included in the path after `/oauth/` instead of as a subdomain
- Wildcard matching for OAuth protected resource routes - all routes starting with `/.well-known/oauth-protected-resource` are now handled

### Changed
- Dynamic client registration URL format changed from `https://{clientId}.auth.civic.com/oauth/` to `https://auth.civic.com/oauth/{clientId}/`

### Security
- Updated @types/supertest to resolve critical vulnerability CVE-2025-7783 in form-data dependency

## [0.2.2] - 2025-08-29

### Added
- Option to disable client ID verification
- Support for wildcard OAuth protected resource routes

## [0.2.1] - 2025-08-28

### Fixed
- Various bug fixes and improvements

## [0.2.0] - 2025-08-27

### Added
- Configurable MCP route protection
- Enhanced OAuth integration

## [0.1.9] - 2025-08-26

### Added
- Configurable MCP route protection

## [0.1.8] - 2025-08-25

### Changed
- Version bump, readme and spec cleanup

[0.2.3]: https://github.com/civicteam/auth-mcp/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/civicteam/auth-mcp/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/civicteam/auth-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/civicteam/auth-mcp/compare/v0.1.9...v0.2.0
[0.1.9]: https://github.com/civicteam/auth-mcp/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/civicteam/auth-mcp/releases/tag/v0.1.8