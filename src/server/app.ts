import express from "express";

export function createServer() {
  const app = express();

  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "talent-os",
      phase: "0"
    });
  });

  return app;
}
