import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { clientMetadataHandler } from "./clientMetadataHandler.js";

const URL = "https://app.example.com/oauth/client-metadata.json";

const buildApp = (cacheMaxAgeSeconds?: number) => {
  const app = express();
  app.get(
    "/oauth/client-metadata.json",
    clientMetadataHandler({
      url: URL,
      clientName: "Test Client",
      redirectUris: ["http://localhost/callback"],
      cacheMaxAgeSeconds,
    })
  );
  return app;
};

describe("clientMetadataHandler", () => {
  it("serves the document as JSON with client_id matching the hosting URL", async () => {
    const response = await request(buildApp()).get("/oauth/client-metadata.json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual({
      client_id: URL,
      client_name: "Test Client",
      redirect_uris: ["http://localhost/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  it("sets a default Cache-Control header", async () => {
    const response = await request(buildApp()).get("/oauth/client-metadata.json");
    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("honours a custom cache max-age", async () => {
    const response = await request(buildApp(60)).get("/oauth/client-metadata.json");
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
  });

  it("fails fast at setup time on invalid configuration", () => {
    expect(() =>
      clientMetadataHandler({
        url: "http://insecure.example.com/client.json",
        clientName: "Test Client",
        redirectUris: ["http://localhost/callback"],
      })
    ).toThrow(/https scheme/);
  });
});
