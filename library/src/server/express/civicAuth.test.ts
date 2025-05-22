import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as provider from "../provider.js";
import { civicAuth } from "./civicAuth.js";

// Mock SDK dependencies with specific paths
vi.mock("@modelcontextprotocol/sdk/server/auth/router.js", () => ({
	mcpAuthRouter: vi
		.fn()
		.mockReturnValue((req: unknown, res: unknown, next: () => void) => next()),
}));

vi.mock(
	"@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js",
	() => ({
		requireBearerAuth: vi
			.fn()
			.mockReturnValue((req: unknown, res: unknown, next: () => void) =>
				next(),
			),
	}),
);

vi.mock(
	"@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js",
	() => ({
		ProxyOAuthServerProvider: vi.fn().mockImplementation(() => ({})),
	}),
);

vi.mock("../provider.js", () => {
	return {
		createCivicOAuthProvider: vi.fn().mockResolvedValue({
			proxy: {},
			router: {
				issuerUrl: new URL("http://localhost:3000/"),
				serviceDocumentationUrl: new URL("https://docs.civic.com/"),
			},
		}),
	};
});

vi.mock("express", () => {
	const mockRouter = {
		use: vi.fn(),
	};
	return {
		Router: vi.fn().mockReturnValue(mockRouter),
	};
});

describe("civicAuth", () => {
	const options = {
		redirectUris: ["http://localhost:8080/callback"],
		issuerUrl: new URL("http://localhost:3000"),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should create an OAuth provider", async () => {
		await civicAuth(options);
		expect(provider.createCivicOAuthProvider).toHaveBeenCalledWith(options);
	});

	it("should set up the MCP Auth Router", async () => {
		await civicAuth(options);
		expect(mcpAuthRouter).toHaveBeenCalledWith({
			provider: expect.anything(),
			issuerUrl: options.issuerUrl,
			serviceDocumentationUrl: expect.any(URL),
			basePath: "/auth",
		});
	});

	it("should use the default basePath if not provided", async () => {
		await civicAuth(options);
		expect(mcpAuthRouter).toHaveBeenCalledWith(
			expect.objectContaining({
				basePath: "/auth",
			}),
		);
	});

	it("should use a custom basePath if provided", async () => {
		await civicAuth({ ...options, basePath: "/custom-auth" });
		expect(mcpAuthRouter).toHaveBeenCalledWith(
			expect.objectContaining({
				basePath: "/custom-auth",
			}),
		);
	});

	it("should apply requireBearerAuth middleware", async () => {
		await civicAuth(options);

		expect(requireBearerAuth).toHaveBeenCalledWith({
			provider: expect.anything(),
		});
	});
});
