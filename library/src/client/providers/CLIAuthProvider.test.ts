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

// Mock http server
const mockServerInstance = {
  listen: vi.fn((_port, callback) => callback()),
  close: vi.fn((callback) => callback?.()),
};

vi.mock("node:http", () => ({
  default: {
    createServer: vi.fn(() => mockServerInstance),
  },
}));

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
      const authUrl = new URL("https://auth.example.com/authorize");

      await provider.redirectToAuthorization(authUrl);

      // Verify server was created and started
      expect(http.createServer).toHaveBeenCalled();
      expect(mockServerInstance.listen).toHaveBeenCalledWith(8080, expect.any(Function));

      // Verify browser was opened
      expect(execFile).toHaveBeenCalled();
    });

    it("should handle different platforms for opening browser", async () => {
      const authUrl = new URL("https://auth.example.com/authorize");

      // Test macOS
      vi.clearAllMocks();
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
      await provider.redirectToAuthorization(authUrl);
      expect(execFile).toHaveBeenCalledWith("open", [authUrl.href], expect.any(Function));

      // Test Windows
      vi.clearAllMocks();
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      await provider.redirectToAuthorization(authUrl);
      expect(execFile).toHaveBeenCalledWith("cmd", ["/c", "start", authUrl.href], expect.any(Function));

      // Test Linux
      vi.clearAllMocks();
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      await provider.redirectToAuthorization(authUrl);
      expect(execFile).toHaveBeenCalledWith("xdg-open", [authUrl.href], expect.any(Function));
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
      // Register a mock transport
      const mockTransport = {
        finishAuth: vi.fn().mockResolvedValue(undefined),
      } as any;
      provider.registerTransport(mockTransport);

      // Start the authorization flow
      const authUrl = new URL("https://auth.example.com/authorize");
      await provider.redirectToAuthorization(authUrl);

      // Get the server callback handler
      const serverCallback = (http.createServer as any).mock.calls[0][0];

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
      const code = await provider.waitForAuthorizationCode();
      expect(code).toBe("test-auth-code");

      // Verify response was sent
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html" });
      expect(mockRes.end).toHaveBeenCalled();
      expect(mockTransport.finishAuth).toHaveBeenCalledWith("test-auth-code");
    });

    it("should handle callback errors", async () => {
      // Start the authorization flow
      const authUrl = new URL("https://auth.example.com/authorize");
      await provider.redirectToAuthorization(authUrl);

      // Get the server callback handler
      const serverCallback = (http.createServer as any).mock.calls[0][0];

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
      await expect(provider.waitForAuthorizationCode()).rejects.toThrow("OAuth error: access_denied");
    });
  });
});
