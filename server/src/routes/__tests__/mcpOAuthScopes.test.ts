
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { closePool } from "../../db/pool.js";

describe("MCP OAuth scope metadata", () => {
  beforeAll(() => {
    process.env.MCP_PUBLIC_URL = "https://signalai-mcp.example";
  });

  afterAll(async () => {
    delete process.env.MCP_PUBLIC_URL;
    await closePool();
  });

  it("advertises read and write scopes in OAuth and protected-resource metadata", async () => {
    const app = createApp();
    const oauth = await request(app).get("/.well-known/oauth-authorization-server");
    expect(oauth.status).toBe(200);
    expect(oauth.body.scopes_supported).toEqual(expect.arrayContaining(["signalai:read", "signalai:write"]));

    const resource = await request(app).get("/.well-known/oauth-protected-resource/mcp");
    expect(resource.status).toBe(200);
    expect(resource.body.scopes_supported).toEqual(expect.arrayContaining(["signalai:read", "signalai:write"]));
    expect(resource.body.resource).toBe("https://signalai-mcp.example/mcp");
  });
});
