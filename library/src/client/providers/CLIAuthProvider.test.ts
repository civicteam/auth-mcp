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

      // Test Windows
      vi.clearAllMocks();
      const mockServerWin = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(mockServerWin as any);
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      await provider.redirectToAuthorization(authUrl);
      expect(execFile).toHaveBeenCalledWith("cmd", ["/c", "start", authUrl.href], expect.any(Function));

      // Test Linux
      vi.clearAllMocks();
      const mockServerLinux = createMockServer();
      vi.mocked(http.createServer).mockReturnValue(mockServerLinux as any);
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      await provider.redirectToAuthorization(authUrl);
      expect(execFile).toHaveBeenCalledWith("xdg-open", [authUrl.href], expect.any(Function));
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

      // Verify the actual callback port was updated
      const redirectUrl = providerWithFallback.redirectUrl;
      expect(redirectUrl.toString()).toBe("http://localhost:3000/callback");

      const metadata = providerWithFallback.clientMetadata;
      expect(metadata.redirect_uris).toEqual(["http://localhost:3000/callback"]);
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

      // Get the server callback handler from the most recent createServer call
      const createServerCalls = vi.mocked(http.createServer).mock.calls;
      const serverCallback = createServerCalls[createServerCalls.length - 1][0] as (req: any, res: any) => void;

      // Simulate callback request with code
      const mockReq = {
        url: "/callback?code=test-auth-code",
      };
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      };

      serverCallback(mockReq, mockRes);

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

      // Get the server callback handler from the most recent createServer call
      const createServerCalls = vi.mocked(http.createServer).mock.calls;
      const serverCallback = createServerCalls[createServerCalls.length - 1][0] as (req: any, res: any) => void;

      // Simulate callback request with error
      const mockReq = {
        url: "/callback?error=access_denied&error_description=User+denied+access",
      };
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      };

      serverCallback(mockReq, mockRes);

      // Wait for authorization should reject
      await expect(testProvider.waitForAuthorizationCode()).rejects.toThrow("OAuth error: access_denied");
    });
  });
});
