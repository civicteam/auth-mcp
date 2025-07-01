# Plan to Add JWKS Direct Option and Test JWT Verification

## Overview
Add the ability to pass JWKS keys directly via CivicAuthOptions instead of fetching them from a remote URL. This allows for easier testing and use cases where keys are managed locally.

## Implementation Plan

### 1. Update Types (library/src/types.ts)
- Add a new optional field `jwks` to `CivicAuthOptions` interface
- The field will accept a JWKS object with a `keys` array containing JWK keys
- TypeScript type structure:
  ```typescript
  jwks?: {
    keys: Array<{
      kty: string;
      kid?: string;
      use?: string;
      alg?: string;
      [key: string]: any; // Additional JWK properties
    }>;
  };
  ```

### 2. Update McpServerAuth Implementation (library/src/McpServerAuth.ts)
- Import `createLocalJWKSet` from jose alongside existing imports
- **Keep the OIDC config fetch** - Still retrieve the OIDC configuration as it contains important information about routes and endpoints
- Modify the constructor to:
  - Check if `options.jwks` is provided
  - If yes, use `createLocalJWKSet(options.jwks)` instead of `createRemoteJWKSet`
  - If no, continue with the existing `createRemoteJWKSet` using the jwks_uri from OIDC config
- The OIDC config fetch remains unchanged - only the JWKS retrieval method changes

### 3. Create Test Utilities (library/src/test-utils/jwt-test-helpers.ts)
- Create utility functions for:
  - Generating RSA key pairs using jose's `generateKeyPair`
  - Converting keys to JWK format using jose's `exportJWK`
  - Creating a test JWKS with the public key
  - Generating a long-lived JWT (10 years expiry) signed with the private key using `SignJWT`
  - The JWT will include standard claims:
    - `sub`: Subject identifier
    - `client_id`: Client identifier
    - `scope`: Space-separated scopes
    - `exp`: Expiration (10 years from now)
    - `iat`: Issued at
    - `iss`: Issuer (matching the OIDC config issuer)

### 4. Update Tests (library/src/McpServerAuth.test.ts)
- Add new test cases for the local JWKS functionality:
  - Test successful JWT verification with local JWKS
  - Verify that OIDC config is still fetched when using local JWKS
  - Test that remote JWKS fetch is skipped when local JWKS is provided
  - Test invalid JWT with local JWKS throws appropriate errors
  - Test client_id verification still works with local JWKS
  - Test that existing remote JWKS functionality remains unchanged

### 5. Create Integration Test (library/src/integration/jwks-direct.test.ts)
- Create a full integration test that:
  - Generates test RSA key pair
  - Creates a test JWKS with the public key
  - Generates a long-lived JWT signed with the private key
  - Initializes McpServerAuth with local JWKS option
  - Simulates an MCP request with the JWT in the Authorization header
  - Verifies:
    - Successful authentication
    - Correct auth info extraction
    - Token contains expected claims
    - OIDC config was fetched
    - Remote JWKS was not fetched

## Benefits
- Easier testing without needing a live auth server
- Support for air-gapped environments
- Ability to use custom key management solutions
- Maintains full backward compatibility
- Still leverages OIDC configuration for endpoint information