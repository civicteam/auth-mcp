#!/usr/bin/env tsx
/**
 * Generate a test RSA key pair and JWT with 10-year expiry
 * Usage: tsx generateKeyAndJWT.ts
 */

import { generateTestSetup } from "./jwt-test-helpers.js";

async function main() {
  // Generate key pair and JWT
  const { jwks, jwt, privateKey } = await generateTestSetup();

  console.log("=== Generated Test Keys and JWT ===\n");

  console.log("JWKS:");
  console.log(JSON.stringify(jwks, null, 2));
  console.log("\n");

  console.log("Private Key (PEM format):");
  console.log(privateKey);
  console.log("\n");

  console.log("JWT (valid for 10 years):");
  console.log(jwt);
  console.log("\n");
}

main();
