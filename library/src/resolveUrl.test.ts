import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { resolveBaseUrl } from "./resolveUrl.js";

function mockReq(overrides: { protocol?: string; headers?: Record<string, string> } = {}): IncomingMessage {
  return {
    protocol: overrides.protocol ?? "http",
    headers: overrides.headers ?? { host: "example.com" },
  } as any;
}

describe("resolveBaseUrl", () => {
  it("should use req.protocol and host header by default", () => {
    const req = mockReq({ protocol: "http", headers: { host: "example.com" } });
    expect(resolveBaseUrl(req)).toBe("http://example.com");
  });

  it("should use https when forceHttps is true", () => {
    const req = mockReq({ protocol: "http", headers: { host: "example.com" } });
    expect(resolveBaseUrl(req, { forceHttps: true })).toBe("https://example.com");
  });

  it("should read protocol from protocolHeader", () => {
    const req = mockReq({
      protocol: "http",
      headers: { host: "example.com", "x-forwarded-proto": "https" },
    });
    expect(resolveBaseUrl(req, { protocolHeader: "X-Forwarded-Proto" })).toBe("https://example.com");
  });

  it("should fall back to req.protocol when protocolHeader is missing from request", () => {
    const req = mockReq({ protocol: "http", headers: { host: "example.com" } });
    expect(resolveBaseUrl(req, { protocolHeader: "X-Forwarded-Proto" })).toBe("http://example.com");
  });

  it("should prefer forceHttps over protocolHeader", () => {
    const req = mockReq({
      headers: { host: "example.com", "x-forwarded-proto": "http" },
    });
    expect(resolveBaseUrl(req, { forceHttps: true, protocolHeader: "X-Forwarded-Proto" })).toBe("https://example.com");
  });

  it("should read host from hostHeader", () => {
    const req = mockReq({
      headers: { host: "internal.local", "x-forwarded-host": "public.example.com" },
    });
    expect(resolveBaseUrl(req, { hostHeader: "X-Forwarded-Host" })).toBe("http://public.example.com");
  });

  it("should fall back to host header when hostHeader is missing from request", () => {
    const req = mockReq({ headers: { host: "example.com" } });
    expect(resolveBaseUrl(req, { hostHeader: "X-Forwarded-Host" })).toBe("http://example.com");
  });

  it("should fall back to localhost when no host header at all", () => {
    const req = mockReq({ headers: {} });
    expect(resolveBaseUrl(req)).toBe("http://localhost");
  });

  it("should combine protocolHeader and hostHeader", () => {
    const req = mockReq({
      protocol: "http",
      headers: {
        host: "internal:3000",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "app.example.com",
      },
    });
    expect(
      resolveBaseUrl(req, {
        protocolHeader: "X-Forwarded-Proto",
        hostHeader: "X-Forwarded-Host",
      })
    ).toBe("https://app.example.com");
  });
});
