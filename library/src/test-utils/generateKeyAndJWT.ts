#!/usr/bin/env tsx
/**
 * Generate a test RSA key pair and JWT with 10-year expiry
 * Usage: tsx generateKeyAndJWT.ts
 */

import { generateTestSetup } from "./jwt-test-helpers.js";

async function main() {
    // Generate key pair and JWT with 10-year expiry
    const tenYearsInSeconds = 10 * 365 * 24 * 60 * 60;
    const { jwks, jwt } = await generateTestSetup({
      expiresIn: tenYearsInSeconds,
      clientId: "test-client",
      sub: "test-user",
      scope: "openid profile email",
      issuer: "https://auth.civic.com",
    });

    console.log("=== Generated Test Keys and JWT ===\n");
    
    console.log("JWKS:");
    console.log(JSON.stringify(jwks, null, 2));
    console.log("\n");
    
    console.log("JWT (valid for 10 years):");
    console.log(jwt);
    console.log("\n");
}

main();