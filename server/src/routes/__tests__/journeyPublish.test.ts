import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";

describe("journey publishing", () => {
  it("exposes the publish endpoint", async () => {
    /*
     * This test intentionally verifies the route contract without assuming
     * a fixture campaign exists in the unit-test database.
     *
     * The authentication middleware should reject an unauthenticated
     * request before any graph mutation happens.
     */
    const response = await request(app)
      .post(
        "/tenants/00000000-0000-0000-0000-000000000000/campaigns/00000000-0000-0000-0000-000000000000/journey/publish",
      )
      .send({ expectedBuilderVersion: 1 });

    expect([401, 403]).toContain(response.status);
  });

  it("exposes the published journey endpoint", async () => {
    const response = await request(app).get(
      "/tenants/00000000-0000-0000-0000-000000000000/campaigns/00000000-0000-0000-0000-000000000000/journey/published",
    );

    expect([401, 403]).toContain(response.status);
  });
});
