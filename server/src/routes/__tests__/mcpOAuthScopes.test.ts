import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";

describe("MCP OAuth scope metadata", () => {
  beforeAll(() => {
    process.env.MCP_PUBLIC_URL = "https://signalai-mcp.example";
  });

  afterAll(() => {
    delete process.env.MCP_PUBLIC_URL;
  });

  it("advertises read, write, publish, and operate scopes in OAuth and protected-resource metadata", async () => {
    const app = createApp();
    const expectedScopes = [
      "signalai:read",
      "signalai:write",
      "signalai:automation:publish",
      "signalai:automation:operate",
    ];

    const oauth = await request(app).get("/.well-known/oauth-authorization-server");
    expect(oauth.status).toBe(200);
    expect(oauth.body.scopes_supported).toEqual(expect.arrayContaining(expectedScopes));

    const resource = await request(app).get("/.well-known/oauth-protected-resource/mcp");
    expect(resource.status).toBe(200);
    expect(resource.body.scopes_supported).toEqual(expect.arrayContaining(expectedScopes));
    expect(resource.body.resource).toBe("https://signalai-mcp.example/mcp");
  });
});
