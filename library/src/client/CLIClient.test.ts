import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIClient } from "./CLIClient.js";
import type { CLIAuthProvider } from "./providers/index.js";
import type { RestartableStreamableHTTPClientTransport } from "./transport/index.js";

// Mock the parent Client class
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    async connect(transport: any) {
      // Simulate different scenarios based on test needs
      if (transport._shouldFailAuth) {
        throw new Error("Unauthorized");
      }
      // Success case - do nothing
    }
  },
}));

describe("CLIClient", () => {
  let client: CLIClient;
  let mockTransport: RestartableStreamableHTTPClientTransport;
  let mockAuthProvider: CLIAuthProvider;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock auth provider
    mockAuthProvider = {
      waitForAuthorizationCode: vi.fn().mockResolvedValue(undefined),
      tokens: vi.fn().mockReturnValue(null), // No tokens initially
    } as any;

    // Create mock transport
    mockTransport = {
      finishAuth: vi.fn().mockResolvedValue(undefined),
      restartClient: vi.fn(),
      _shouldFailAuth: false, // Control test behavior
      authProvider: mockAuthProvider,
    } as any;

    client = new CLIClient({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  });

  describe("connect", () => {
    it("should connect successfully on first try", async () => {
      await client.connect(mockTransport);

      // Should not call auth flow
      expect(mockAuthProvider.waitForAuthorizationCode).not.toHaveBeenCalled();
      expect(mockTransport.finishAuth).not.toHaveBeenCalled();
    });

    it("should handle auth flow when initial connection fails", async () => {
      // Set up to simulate auth flow
      let callCount = 0;

      // Mock the parent class connect method
      vi.spyOn(Client.prototype, "connect").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Unauthorized");
        }
        // Second call succeeds
      });

      await client.connect(mockTransport);

      // Should have triggered auth flow
      expect(mockAuthProvider.waitForAuthorizationCode).toHaveBeenCalled();
      expect(Client.prototype.connect).toHaveBeenCalledTimes(2);
    });

    it("should propagate non-auth errors", async () => {
      // Override connect to throw non-auth error
      const testError = new Error("Network error");
      client.connect = vi.fn().mockRejectedValue(testError);

      await expect(client.connect(mockTransport)).rejects.toThrow("Network error");

      // Should not trigger auth flow
      expect(mockAuthProvider.waitForAuthorizationCode).not.toHaveBeenCalled();
      expect(mockTransport.finishAuth).not.toHaveBeenCalled();
    });

    it("should handle missing auth provider", async () => {
      // Create transport without auth provider
      const transportWithoutAuth = {
        finishAuth: vi.fn(),
        restartClient: vi.fn(),
        authProvider: null,
      } as any;

      // Override connect to throw auth error
      const originalConnect = Client.prototype.connect;
      Client.prototype.connect = vi.fn().mockRejectedValue(new Error("Unauthorized"));

      await expect(client.connect(transportWithoutAuth)).rejects.toThrow();

      // Restore original
      Client.prototype.connect = originalConnect;
    });

    it("should log appropriate messages during auth flow", async () => {
      const consoleSpy = vi.spyOn(console, "log");

      // Set up to simulate auth flow
      let callCount = 0;

      // Mock the parent class connect method
      vi.spyOn(Client.prototype, "connect").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Unauthorized");
        }
        // Second call succeeds
      });

      await client.connect(mockTransport);

      expect(consoleSpy).toHaveBeenCalledWith("Error connecting to MCP server:", expect.any(Error));
      expect(consoleSpy).toHaveBeenCalledWith("Authorization required, waiting for user to complete OAuth flow...");
      expect(consoleSpy).toHaveBeenCalledWith("Authorization completed.");

      consoleSpy.mockRestore();
    });
  });
});
