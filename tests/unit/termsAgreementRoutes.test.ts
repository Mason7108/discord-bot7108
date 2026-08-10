import type { Express } from "express";
import { describe, expect, it, vi } from "vitest";
import { registerTermsAgreementRoutes } from "../../src/systems/termsAgreement.js";

type RouteHandler = (req: Record<string, never>, res: ReturnType<typeof createResponse>) => unknown;

function createRouteRegistry(): {
  app: Express;
  getRoutes: Map<string, RouteHandler>;
  postRoutes: Map<string, RouteHandler>;
} {
  const getRoutes = new Map<string, RouteHandler>();
  const postRoutes = new Map<string, RouteHandler>();
  const register = (registry: Map<string, RouteHandler>, paths: string | string[], handler: RouteHandler) => {
    for (const path of Array.isArray(paths) ? paths : [paths]) {
      registry.set(path, handler);
    }
  };

  const app = {
    get: (paths: string | string[], handler: RouteHandler) => register(getRoutes, paths, handler),
    post: (paths: string | string[], handler: RouteHandler) => register(postRoutes, paths, handler)
  } as unknown as Express;

  return { app, getRoutes, postRoutes };
}

function createResponse() {
  const response = {
    status: vi.fn(),
    type: vi.fn(),
    send: vi.fn(),
    redirect: vi.fn()
  };
  response.status.mockReturnValue(response);
  response.type.mockReturnValue(response);
  response.send.mockReturnValue(response);
  response.redirect.mockReturnValue(response);
  return response;
}

describe("terms and privacy routes", () => {
  it("serves the policies without an agreement form or Discord sign-in", () => {
    const { app, getRoutes } = createRouteRegistry();
    registerTermsAgreementRoutes(app);
    const response = createResponse();

    getRoutes.get("/terms")?.({}, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.type).toHaveBeenCalledWith("html");
    const html = response.send.mock.calls[0]?.[0] as string;
    expect(html).toContain("No separate verification, Discord sign-in, or agreement submission is required.");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Submit Agreement");
  });

  it("redirects legacy agreement endpoints to the public policy notice", () => {
    const { app, getRoutes, postRoutes } = createRouteRegistry();
    registerTermsAgreementRoutes(app);
    const loginResponse = createResponse();
    const submitResponse = createResponse();

    getRoutes.get("/auth/discord")?.({}, loginResponse);
    postRoutes.get("/terms/agree")?.({}, submitResponse);

    expect(loginResponse.redirect).toHaveBeenCalledWith(302, "/terms#agreement");
    expect(submitResponse.redirect).toHaveBeenCalledWith(303, "/terms#agreement");
  });
});
