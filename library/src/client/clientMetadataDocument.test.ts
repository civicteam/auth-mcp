import { describe, expect, it } from "vitest";
import {
  assertValidClientMetadataUrl,
  buildClientMetadataDocument,
  LOOPBACK_REDIRECT_URIS,
} from "./clientMetadataDocument.js";

const VALID_URL = "https://app.example.com/oauth/client-metadata.json";

describe("assertValidClientMetadataUrl", () => {
  it("accepts an HTTPS URL with a path component", () => {
    expect(() => assertValidClientMetadataUrl(VALID_URL)).not.toThrow();
  });

  it("rejects a non-URL string", () => {
    expect(() => assertValidClientMetadataUrl("not a url")).toThrow(/valid URL/);
  });

  it("rejects http URLs", () => {
    expect(() => assertValidClientMetadataUrl("http://app.example.com/client.json")).toThrow(/https scheme/);
  });

  it("rejects URLs without a path component", () => {
    expect(() => assertValidClientMetadataUrl("https://app.example.com")).toThrow(/path component/);
    expect(() => assertValidClientMetadataUrl("https://app.example.com/")).toThrow(/path component/);
  });

  it("rejects URLs with a fragment", () => {
    expect(() => assertValidClientMetadataUrl(`${VALID_URL}#frag`)).toThrow(/fragment/);
  });

  it("rejects URLs with embedded credentials", () => {
    expect(() => assertValidClientMetadataUrl("https://user:pass@app.example.com/client.json")).toThrow(/credentials/);
  });
});

describe("buildClientMetadataDocument", () => {
  it("uses the hosting URL verbatim as client_id", () => {
    const document = buildClientMetadataDocument({
      url: VALID_URL,
      clientName: "Test Client",
      redirectUris: LOOPBACK_REDIRECT_URIS,
    });

    expect(document.client_id).toBe(VALID_URL);
    expect(document.client_name).toBe("Test Client");
    expect(document.redirect_uris).toEqual(["http://localhost/callback", "http://127.0.0.1/callback"]);
  });

  it("applies public-client defaults", () => {
    const document = buildClientMetadataDocument({
      url: VALID_URL,
      clientName: "Test Client",
      redirectUris: LOOPBACK_REDIRECT_URIS,
    });

    expect(document.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(document.response_types).toEqual(["code"]);
    expect(document.token_endpoint_auth_method).toBe("none");
  });

  it("includes optional fields only when provided", () => {
    const minimal = buildClientMetadataDocument({
      url: VALID_URL,
      clientName: "Test Client",
      redirectUris: LOOPBACK_REDIRECT_URIS,
    });
    expect(minimal).not.toHaveProperty("client_uri");
    expect(minimal).not.toHaveProperty("logo_uri");
    expect(minimal).not.toHaveProperty("scope");

    const full = buildClientMetadataDocument({
      url: VALID_URL,
      clientName: "Test Client",
      redirectUris: ["https://app.example.com/callback"],
      clientUri: "https://app.example.com",
      logoUri: "https://app.example.com/logo.png",
      scope: "openid profile",
    });
    expect(full.client_uri).toBe("https://app.example.com");
    expect(full.logo_uri).toBe("https://app.example.com/logo.png");
    expect(full.scope).toBe("openid profile");
  });

  it("rejects an empty redirect URI list", () => {
    expect(() => buildClientMetadataDocument({ url: VALID_URL, clientName: "Test Client", redirectUris: [] })).toThrow(
      /redirect URI/
    );
  });

  it("rejects an invalid hosting URL", () => {
    expect(() =>
      buildClientMetadataDocument({
        url: "http://app.example.com/client.json",
        clientName: "Test Client",
        redirectUris: LOOPBACK_REDIRECT_URIS,
      })
    ).toThrow(/https scheme/);
  });
});
