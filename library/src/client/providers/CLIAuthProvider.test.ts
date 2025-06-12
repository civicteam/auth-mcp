import { execFile } from "node:child_process";
import http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SCOPES } from "../../constants.js";
import { CLIAuthProvider } from "./CLIAuthProvider.js";

// Mock node modules
vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd, _args, callback) => {
    if (typeof _args === "function") {
      // Handle promisify case
      _args(null, "", "");
    } else if (callback) {
      callback(null, "", "");
    }
  }),
}));

// Mock http module
vi.mock("node:http", () => ({
  default: {
    createServer: vi.fn(),
  },
}));

// Helper function to create a clean mock server
function createMockServer(port = 8080) {
  const mockServer = {
    listen: vi.fn((_port, _host) => {
      // Immediately trigger 'listening' event
      setImmediate(() => {
        const listeningHandler = mockServer.once.mock.calls.find((call) => call[0] === "listening")?.[1];
        if (listeningHandler) {
          listeningHandler();
        }
      });
    }),
    close: vi.fn((callback) => callback?.()),
    once: vi.fn(),
    off: vi.fn(),
    address: vi.fn(() => ({ port })),
  };
  return mockServer;
}

// Helper function to simulate a callback request
function simulateCallback(url: string) {
  const createServerCalls = vi.mocked(http.createServer).mock.calls;
  const serverCallback = createServerCalls[createServerCalls.length - 1][0] as (req: any, res: any) => void;

  const mockReq = { url };
  const mockRes = {
    writeHead: vi.fn(),
    end: vi.fn(),
  };

  serverCallback(mockReq, mockRes);
  return mockRes;
}

describe("CLIAuthProvider", () => {
  let provider: CLIAuthProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CLIAuthProvider({
      clientId: "test-client-id",
      scope: DEFAULT_SCOPES.join(" "),
      callbackPort: 8080,
    });
  });

  describe("clientInformation", () => {
    it("should return client information with client_id", () => {
      const info = provider.clientInformation();
      expect(info).toEqual({ client_id: "test-client-id" });
    });

    it("should include client_secret if provided", () => {
      const providerWithSecret = new CLIAuthProvider({
        clientId: "test-client-id",
        clientSecret: "test-secret",
      });

      const info = providerWithSecret.clientInformation();
      expect(info).toEqual({
        client_id: "test-client-id",
        client_secret: "test-secret",
      });
    });
  });

  describe("clientMetadata", () => {
    it("should return correct metadata", () => {
      const metadata = provider.clientMetadata;
      expect(metadata).toEqual({
        redirect_uris: ["http://localhost:8080/callback"],
        client_name: "test-client-id",
        scope: DEFAULT_SCOPES.join(" "),
      });
    });

    it("should use default values when not specified", () => {
      const minimalProvider = new CLIAuthProvider({
        clientId: "test-client-id",
      });

      const metadata = minimalProvider.clientMetadata;
      expect(metadata.scope).toBe(DEFAULT_SCOPES.join(" ")); // DEFAULT_SCOPES
      expect(metadata.redirect_uris).toEqual(["http://localhost:8080/callback"]); // DEFAULT_CALLBACK_PORT
    });
  });

  describe("codeVerifier", () => {
    it("should generate and store code verifier", () => {
      const verifier1 = provider.codeVerifier();
      const verifier2 = provider.codeVerifier();

      expect(verifier1).toBe(verifier2); // Should return same value
      expect(verifier1).toMatch(/^[A-Za-z0-9_-]+$/); // Base64url format
    });
  });

  describe("redirectUrl", () => {
    it("should return correct redirect URL", () => {
      const url = provider.redirectUrl;
      expect(url).toBeInstanceOf(URL);
      expect(url.toString()).toBe("http://localhost:8080/callback");
    });

    it("should use custom callback port", () => {
      const customProvider = new CLIAuthProvider({
        clientId: "test-client-id",
        callbackPort: 9090,
      });

      const url = customProvider.redirectUrl;
      expect(url.toString()).toBe("http://localhost:9090/callback");
    });
  });

  describe("saveCodeVerifier", () => {
    it("should save code verifier", () => {
      provider.saveCodeVerifier("test-verifier");
      expect(provider.codeVerifier()).toBe("test-verifier");
    });
  });

  describe("saveTokens", () => {
    it("should save tokens", () => {
      const tokens = {
        access_token: "test-access-token",
        token_type: "Bearer" as const,
      };

      provider.saveTokens(tokens);
      expect(provider.tokens()).toEqual(tokens);
    });
  });

  describe("redirectToAuthorization", () => {
    it("should start callback server and open browser", async () => {
      const mockServer = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(mockServer as any);

      const authUrl = new URL("https://auth.example.com/authorize");
      await provider.redirectToAuthorization(authUrl);

      // Verify server was created and started
      expect(http.createServer).toHaveBeenCalled();
      expect(mockServer.listen).toHaveBeenCalledWith(8080, "localhost");
      expect(mockServer.once).toHaveBeenCalledWith("error", expect.any(Function));
      expect(mockServer.once).toHaveBeenCalledWith("listening", expect.any(Function));

      // Verify browser was opened
      expect(execFile).toHaveBeenCalled();
    });

    it("should handle different platforms for opening browser", async () => {
      const authUrl = new URL("https://auth.example.com/authorize");

      // Test macOS
      vi.clearAllMocks();
      const mockServerMac = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(mockServerMac as any);
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
      await provider.redirectToAuthorization(authUrl);
      expect(execFile).toHaveBeenCalledWith("open", [authUrl.href], expect.any(Function));
      // Complete the flow with invalid URL to reset provider state
      simulateCallback("/invalid");

      // Test Windows
      vi.clearAllMocks();
      const mockServerWin = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(mockServerWin as any);
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      await provider.redirectToAuthorization(authUrl);
      expect(execFile).toHaveBeenCalledWith("cmd", ["/c", "start", authUrl.href], expect.any(Function));
      // Complete the flow with invalid URL to reset provider state
      simulateCallback("/invalid");

      // Test Linux
      vi.clearAllMocks();
      const mockServerLinux = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(mockServerLinux as any);
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      await provider.redirectToAuthorization(authUrl);
      expect(execFile).toHaveBeenCalledWith("xdg-open", [authUrl.href], expect.any(Function));
      // Complete the flow with invalid URL to reset provider state
      simulateCallback("/invalid");
    });

    it("should fallback to random port when configured port is in use", async () => {
      const providerWithFallback = new CLIAuthProvider({
        clientId: "test-client-id",
        callbackPort: 8080,
        enablePortFallback: true,
      });

      let errorHandler: ((err: NodeJS.ErrnoException) => void) | undefined;
      let listeningHandler: (() => void) | undefined;

      // Create a mock server that simulates port conflict on first attempt
      const mockServerWithConflict = {
        listen: vi.fn((_port, _host) => {
          setImmediate(() => {
            if (_port === 8080) {
              // First attempt - simulate EADDRINUSE error
              if (errorHandler) {
                const error = new Error("Port in use") as NodeJS.ErrnoException;
                error.code = "EADDRINUSE";
                errorHandler(error);
              }
            } else if (_port === 0) {
              // Second attempt with random port - success
              if (listeningHandler) {
                listeningHandler();
              }
            }
          });
        }),
        close: vi.fn((callback) => callback?.()),
        once: vi.fn((event, handler) => {
          if (event === "error") {
            errorHandler = handler;
          } else if (event === "listening") {
            listeningHandler = handler;
          }
        }),
        off: vi.fn(),
        address: vi.fn(() => ({ port: 3000 })), // Random port assigned
      };

      vi.mocked(http.createServer).mockReturnValue(mockServerWithConflict as any);

      const authUrl = new URL("https://auth.example.com/authorize");
      await providerWithFallback.redirectToAuthorization(authUrl);

      // Verify both listen attempts were made
      expect(mockServerWithConflict.listen).toHaveBeenCalledWith(8080, "localhost");
      expect(mockServerWithConflict.listen).toHaveBeenCalledWith(0, "localhost");
      expect(mockServerWithConflict.listen).toHaveBeenCalledTimes(2);

      // Verify that redirectUrl and clientMetadata use the new port
      const redirectUrl = providerWithFallback.redirectUrl;
      expect(redirectUrl.toString()).toBe("http://localhost:3000/callback");

      const metadata = providerWithFallback.clientMetadata;
      expect(metadata.redirect_uris).toEqual(["http://localhost:3000/callback"]);

      // The authorization URL should have been modified with the actual port
      expect(execFile).toHaveBeenCalledWith(
        "xdg-open",
        [expect.stringContaining("redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback")],
        expect.any(Function)
      );
    });

    it("should throw error when port is in use and fallback is disabled", async () => {
      const providerWithoutFallback = new CLIAuthProvider({
        clientId: "test-client-id",
        callbackPort: 8080,
        enablePortFallback: false,
      });

      // Create a mock server that simulates port conflict
      const mockServerWithError = {
        listen: vi.fn((_port, _host) => {
          setImmediate(() => {
            const errorHandler = mockServerWithError.once.mock.calls.find((call) => call[0] === "error")?.[1];
            if (errorHandler) {
              const error = new Error("Port in use") as NodeJS.ErrnoException;
              error.code = "EADDRINUSE";
              errorHandler(error);
            }
          });
        }),
        close: vi.fn((callback) => callback?.()),
        once: vi.fn(),
        off: vi.fn(),
        address: vi.fn(() => ({ port: 8080 })),
      };

      vi.mocked(http.createServer).mockReturnValue(mockServerWithError as any);

      const authUrl = new URL("https://auth.example.com/authorize");

      await expect(providerWithoutFallback.redirectToAuthorization(authUrl)).rejects.toThrow("Port in use");

      // Should only attempt the configured port once
      expect(mockServerWithError.listen).toHaveBeenCalledWith(8080, "localhost");
      expect(mockServerWithError.listen).toHaveBeenCalledTimes(1);
    });

    it("should throw error when authorization flow is already in progress", async () => {
      const mockServer = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(mockServer as any);

      const authUrl = new URL("https://auth.example.com/authorize");

      // Start first authorization flow
      await provider.redirectToAuthorization(authUrl);

      // Attempt to start second authorization flow should throw
      await expect(provider.redirectToAuthorization(authUrl)).rejects.toThrow(
        "Authorization flow already in progress. Please wait for it to complete."
      );

      // Verify second server was not created
      expect(http.createServer).toHaveBeenCalledTimes(1);
    });
  });

  describe("registerTransport", () => {
    it("should register transport", () => {
      const mockTransport = {} as any;

      // Should not throw
      expect(() => provider.registerTransport(mockTransport)).not.toThrow();
    });
  });

  describe("waitForAuthorizationCode", () => {
    it("should wait for authorization code", async () => {
      // Create a fresh provider for this test
      const testProvider = new CLIAuthProvider({
        clientId: "test-client-id",
        scope: DEFAULT_SCOPES.join(" "),
        callbackPort: 8080,
      });

      // Create a clean mock server for this test
      const cleanMockServer = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(cleanMockServer as any);

      // Register a mock transport
      const mockTransport = {
        finishAuth: vi.fn().mockResolvedValue(undefined),
      } as any;
      testProvider.registerTransport(mockTransport);

      // Start the authorization flow
      const authUrl = new URL("https://auth.example.com/authorize");
      await testProvider.redirectToAuthorization(authUrl);

      // Use helper to simulate callback
      const mockRes = simulateCallback("/callback?code=test-auth-code");

      // Wait for authorization should now resolve
      const code = await testProvider.waitForAuthorizationCode();
      expect(code).toBe("test-auth-code");

      // Verify response was sent
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html" });
      expect(mockRes.end).toHaveBeenCalled();
      expect(mockTransport.finishAuth).toHaveBeenCalledWith("test-auth-code");
    });

    it("should handle callback errors", async () => {
      // Create a fresh provider for this test
      const testProvider = new CLIAuthProvider({
        clientId: "test-client-id",
        scope: DEFAULT_SCOPES.join(" "),
        callbackPort: 8080,
      });

      // Create a clean mock server for this test
      const cleanMockServer = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(cleanMockServer as any);

      // Start the authorization flow
      const authUrl = new URL("https://auth.example.com/authorize");
      await testProvider.redirectToAuthorization(authUrl);

      // Use helper to simulate callback with error
      simulateCallback("/callback?error=access_denied&error_description=User+denied+access");

      // Wait for authorization should reject
      await expect(testProvider.waitForAuthorizationCode()).rejects.toThrow("OAuth error: access_denied");
    });

    it("should handle server timeout", async () => {
      // Create a provider with very short timeout for testing
      const testProvider = new CLIAuthProvider({
        clientId: "test-client-id",
        scope: DEFAULT_SCOPES.join(" "),
        callbackPort: 8080,
        authTimeoutMs: 100, // 100ms timeout
      });

      // Create a clean mock server for this test
      const cleanMockServer = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(cleanMockServer as any);

      // Start the authorization flow
      const authUrl = new URL("https://auth.example.com/authorize");
      await testProvider.redirectToAuthorization(authUrl);

      // Wait for timeout (no callback simulation)
      await new Promise((resolve) => setTimeout(resolve, 150)); // Wait longer than timeout

      // Verify server was cleaned up after timeout
      expect(cleanMockServer.close).toHaveBeenCalled();
    });

    it("should handle missing request URL", async () => {
      const testProvider = new CLIAuthProvider({
        clientId: "test-client-id",
        scope: DEFAULT_SCOPES.join(" "),
        callbackPort: 8080,
      });

      const cleanMockServer = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(cleanMockServer as any);

      const authUrl = new URL("https://auth.example.com/authorize");
      await testProvider.redirectToAuthorization(authUrl);

      // Simulate callback with missing URL
      const createServerCalls = vi.mocked(http.createServer).mock.calls;
      const serverCallback = createServerCalls[createServerCalls.length - 1][0] as (req: any, res: any) => void;

      const mockReq = { url: null }; // Missing URL
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      };

      serverCallback(mockReq, mockRes);

      // Verify 400 response
      expect(mockRes.writeHead).toHaveBeenCalledWith(400);
      expect(mockRes.end).toHaveBeenCalledWith("Bad Request");
    });

    it("should handle missing authorization code", async () => {
      const testProvider = new CLIAuthProvider({
        clientId: "test-client-id",
        scope: DEFAULT_SCOPES.join(" "),
        callbackPort: 8080,
      });

      const cleanMockServer = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(cleanMockServer as any);

      const authUrl = new URL("https://auth.example.com/authorize");
      await testProvider.redirectToAuthorization(authUrl);

      // Simulate callback without code or error parameters
      const mockRes = simulateCallback("/callback");

      // Verify 400 response for missing authorization code
      expect(mockRes.writeHead).toHaveBeenCalledWith(400);
      expect(mockRes.end).toHaveBeenCalledWith("Missing authorization code");
    });

    it("should handle missing transport", async () => {
      const testProvider = new CLIAuthProvider({
        clientId: "test-client-id",
        scope: DEFAULT_SCOPES.join(" "),
        callbackPort: 8080,
      });

      const cleanMockServer = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(cleanMockServer as any);

      // Do NOT register a transport

      const authUrl = new URL("https://auth.example.com/authorize");
      await testProvider.redirectToAuthorization(authUrl);

      // Simulate successful callback with code but no transport
      simulateCallback("/callback?code=test-auth-code");

      // Wait for authorization should reject with "No transport registered"
      await expect(testProvider.waitForAuthorizationCode()).rejects.toThrow("No transport registered");
    });

    it("should handle finishAuth errors", async () => {
      const testProvider = new CLIAuthProvider({
        clientId: "test-client-id",
        scope: DEFAULT_SCOPES.join(" "),
        callbackPort: 8080,
      });

      const cleanMockServer = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(cleanMockServer as any);

      // Register a mock transport that throws an error
      const mockTransport = {
        finishAuth: vi.fn().mockRejectedValue(new Error("Token exchange failed")),
      } as any;
      testProvider.registerTransport(mockTransport);

      const authUrl = new URL("https://auth.example.com/authorize");
      await testProvider.redirectToAuthorization(authUrl);

      // Spy on console.error to verify error logging
      const consoleErrorSpy = vi.spyOn(console, "error");
      consoleErrorSpy.mockImplementation(() => undefined);

      // Simulate successful callback with code
      simulateCallback("/callback?code=test-auth-code");

      // Wait for authorization should reject with the transport error
      await expect(testProvider.waitForAuthorizationCode()).rejects.toThrow("Token exchange failed");

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error in finishAuth:", expect.any(Error));

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
});
