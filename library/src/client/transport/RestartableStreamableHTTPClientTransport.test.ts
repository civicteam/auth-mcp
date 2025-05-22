import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIAuthProvider } from "../providers/index.js";
import { RestartableStreamableHTTPClientTransport } from "./RestartableStreamableHTTPClientTransport.js";

// Mock StreamableHTTPClientTransport with specific path
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({
		start: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
		finishAuth: vi.fn().mockResolvedValue(undefined),
	})),
}));

// Mock CLIAuthProvider
vi.mock("../providers/CLIAuthProvider.js", () => ({
	CLIAuthProvider: vi.fn().mockImplementation(() => ({
		registerTransport: vi.fn(),
		clientInformation: vi.fn().mockReturnValue({ client_id: "test-client" }),
		clientMetadata: { redirect_uris: ["http://localhost:8080/callback"] },
	})),
}));

describe("RestartableStreamableHTTPClientTransport", () => {
	let transport: RestartableStreamableHTTPClientTransport;
	let mockAuthProvider: CLIAuthProvider;
	const url = new URL("http://localhost:3000");

	beforeEach(() => {
		vi.clearAllMocks();
		mockAuthProvider = new CLIAuthProvider({
			clientId: "test-client",
		});
		transport = new RestartableStreamableHTTPClientTransport(url, {
			authProvider: mockAuthProvider,
		});
	});

	it("should create a transport instance", () => {
		expect(transport).toBeDefined();
		expect(typeof transport.start).toBe("function");
	});

	it("should register itself with the auth provider", () => {
		expect(mockAuthProvider.registerTransport).toHaveBeenCalledWith(transport);
	});
});
