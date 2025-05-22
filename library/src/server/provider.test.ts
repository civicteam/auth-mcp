import { beforeEach, describe, expect, it, vi } from "vitest";
import { CIVIC_AUTH_WELL_KNOWN_URL } from "../constants.js";
import { createCivicOAuthProvider } from "./provider.js";

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock jose
vi.mock("jose", () => ({
	createRemoteJWKSet: vi.fn().mockReturnValue({}),
	jwtVerify: vi.fn().mockResolvedValue({
		payload: {
			client_id: "test-client",
			sub: "user-123",
			scope: "openid profile email",
		},
	}),
}));

const mockWellKnownConfig = {
	issuer: "https://auth.civic.com",
	authorization_endpoint: "https://auth.civic.com/authorize",
	token_endpoint: "https://auth.civic.com/token",
	revocation_endpoint: "https://auth.civic.com/revoke",
	registration_endpoint: "https://auth.civic.com/register",
	jwks_uri: "https://auth.civic.com/.well-known/jwks",
	response_types_supported: ["code"],
	grant_types_supported: ["authorization_code"],
	scopes_supported: ["openid", "profile", "email"],
	token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
};

describe("createCivicOAuthProvider", () => {
	const options = {
		redirectUris: ["http://localhost:8080/callback"],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch.mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue(mockWellKnownConfig),
		});
	});

	it("should fetch the well-known configuration", async () => {
		await createCivicOAuthProvider(options);
		expect(mockFetch).toHaveBeenCalledWith(CIVIC_AUTH_WELL_KNOWN_URL);
	});

	it("should use the provided wellKnownUrl", async () => {
		const customUrl =
			"http://custom-issuer.com/.well-known/openid-configuration";
		await createCivicOAuthProvider({ ...options, wellKnownUrl: customUrl });
		expect(mockFetch).toHaveBeenCalledWith(customUrl);
	});

	it("should create AuthOptions with the correct structure", async () => {
		const authOptions = await createCivicOAuthProvider(options);

		expect(authOptions).toHaveProperty("proxy");
		expect(authOptions).toHaveProperty("router");
		expect(authOptions.proxy).toHaveProperty("endpoints");
		expect(authOptions.proxy).toHaveProperty("verifyAccessToken");
		expect(authOptions.proxy).toHaveProperty("getClient");
	});

	it("should handle fetch errors", async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			statusText: "Not Found",
		});

		await expect(createCivicOAuthProvider(options)).rejects.toThrow(
			"Failed to fetch well-known configuration: Not Found",
		);
	});
});
