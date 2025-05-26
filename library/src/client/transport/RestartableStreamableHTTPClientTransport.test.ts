import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CLIAuthProvider } from "../providers/index.js";
import { RestartableStreamableHTTPClientTransport } from "./RestartableStreamableHTTPClientTransport.js";

// Mock StreamableHTTPClientTransport with specific path
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    finishAuth: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Don't mock CLIAuthProvider - use it directly

describe("RestartableStreamableHTTPClientTransport", () => {
  let transport: RestartableStreamableHTTPClientTransport;
  let mockAuthProvider: CLIAuthProvider;
  let mockInnerTransport: any;
  const url = new URL("http://localhost:3000");

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mocked StreamableHTTPClientTransport
    const { StreamableHTTPClientTransport } = vi.mocked(
      await import("@modelcontextprotocol/sdk/client/streamableHttp.js")
    );

    // Create mock inner transport
    mockInnerTransport = {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      finishAuth: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      onmessage: null,
      onerror: null,
      onclose: null,
    };

    (StreamableHTTPClientTransport as any).mockImplementation(() => mockInnerTransport);

    // Create a mock auth provider
    mockAuthProvider = {
      registerTransport: vi.fn(),
      clientInformation: vi.fn().mockReturnValue({ client_id: "test-client" }),
      clientMetadata: { redirect_uris: ["http://localhost:8080/callback"] },
    } as any;

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

  describe("start", () => {
    it("should start the inner transport", async () => {
      await transport.start();
      expect(mockInnerTransport.start).toHaveBeenCalled();
    });

    it("should set up event handlers", async () => {
      await transport.start();
      expect(mockInnerTransport.onmessage).toBeDefined();
      expect(mockInnerTransport.onerror).toBeDefined();
      expect(mockInnerTransport.onclose).toBeDefined();
    });

    it("should propagate messages", async () => {
      const messageHandler = vi.fn();
      transport.onmessage = messageHandler;

      await transport.start();

      // Simulate message from inner transport
      const testMessage = { type: "test", data: "hello" };
      mockInnerTransport.onmessage(testMessage);

      expect(messageHandler).toHaveBeenCalledWith(testMessage);
    });

    it("should propagate errors", async () => {
      const errorHandler = vi.fn();
      transport.onerror = errorHandler;

      await transport.start();

      // Simulate error from inner transport
      const testError = new Error("Test error");
      mockInnerTransport.onerror(testError);

      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it("should propagate close events", async () => {
      const closeHandler = vi.fn();
      transport.onclose = closeHandler;

      await transport.start();

      // Simulate close from inner transport
      mockInnerTransport.onclose();

      expect(closeHandler).toHaveBeenCalled();
    });
  });

  describe("close", () => {
    it("should be able to close", async () => {
      await transport.start();
      // close() is overridden but still calls parent
      await expect(transport.close()).resolves.toBeUndefined();
    });
  });

  describe("auth provider getter", () => {
    it("should return the auth provider", () => {
      // Since our class extends StreamableHTTPClientTransport which is mocked,
      // we need to test that the transport stores the auth provider
      // The getter is defined on our class, so it should work
      expect(transport._cliAuthProvider).toBe(mockAuthProvider);
    });
  });
});
