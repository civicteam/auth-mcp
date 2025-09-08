import { type CryptoKey, exportJWK, exportPKCS8, generateKeyPair, type JWK, SignJWT } from "jose";

/**
 * Generate an RSA key pair for testing
 * @returns Promise containing the public and private keys
 */
export const generateTestKeyPair = async (): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}> => {
  return generateKeyPair("RS256", { extractable: true });
};

/**
 * Convert a key to JWK format
 * @param key The key to convert
 * @returns The key in JWK format
 */
export const keyToJWK = async (key: CryptoKey): Promise<JWK> => {
  return exportJWK(key);
};

/**
 * Create a test JWKS from a public key
 * @param publicKey The public key to include in the JWKS
 * @param kid Optional key ID
 * @returns JWKS object with the public key
 */
export const createTestJWKS = async (
  publicKey: CryptoKey,
  kid = "test-key-1"
): Promise<{
  keys: Array<{
    kty: string;
    kid?: string;
    use?: string;
    alg?: string;
    [key: string]: unknown;
  }>;
}> => {
  const jwk = await keyToJWK(publicKey);
  if (!jwk.kty) {
    throw new Error("JWK must have kty property");
  }
  return {
    keys: [
      {
        ...jwk,
        kty: jwk.kty,
        kid,
        use: "sig",
        alg: "RS256",
      },
    ],
  };
};

/**
 * Generate a long-lived JWT for testing
 * @param privateKey The private key to sign the JWT
 * @param options JWT options
 * @returns Signed JWT string
 */
export const generateTestJWT = async (
  privateKey: CryptoKey,
  options: {
    sub?: string;
    clientId?: string;
    scope?: string;
    issuer?: string;
    expiresIn?: number;
    kid?: string;
  } = {}
): Promise<string> => {
  const {
    sub = "test-user-123",
    clientId = "test-client-id",
    scope = "openid profile email",
    issuer = "https://auth.civic.com/oauth/",
    expiresIn = "10y", // 10 years
    kid = "test-key-1",
  } = options;

  const jwt = new SignJWT({
    scope,
    client_id: clientId,
  })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuedAt()
    .setIssuer(issuer)
    .setSubject(sub)
    .setExpirationTime(expiresIn);

  return jwt.sign(privateKey);
};

/**
 * Generate a complete test setup with keys, JWKS, and JWT
 * @param options Optional configuration for the test setup
 * @returns Object containing keys, JWKS, and signed JWT
 */
export const generateTestSetup = async (
  options: { expiresIn?: number; sub?: string; clientId?: string; scope?: string; issuer?: string; kid?: string } = {}
): Promise<{
  privateKey: string;
  jwks: {
    keys: Array<{
      kty: string;
      kid?: string;
      use?: string;
      alg?: string;
      [key: string]: unknown;
    }>;
  };
  jwt: string;
}> => {
  const { publicKey, privateKey } = await generateTestKeyPair();
  const kid = options.kid || "test-key-1";
  const jwks = await createTestJWKS(publicKey, kid);
  const jwt = await generateTestJWT(privateKey, { ...options, kid });

  const privateKeyPKCS8 = await exportPKCS8(privateKey);

  return {
    privateKey: privateKeyPKCS8,
    jwks,
    jwt,
  };
};
