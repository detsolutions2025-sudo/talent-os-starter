import request from "supertest";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server/app";
import { createMemoryCoreService } from "../src/server/core/service";

describe("health endpoint", () => {
  it("returns the local service status", async () => {
    const response = await request(createServer(createMemoryCoreService()))
      .get("/api/health")
      .expect(200);

    expect(response.body).toEqual({
      status: "ok",
      service: "talent-os",
      phase: "1"
    });
  });
});
