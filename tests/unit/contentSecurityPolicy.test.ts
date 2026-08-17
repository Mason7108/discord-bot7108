import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicyDirectives } from "../../src/api/contentSecurityPolicy.js";

describe("content security policy", () => {
  it("allows the resources required by Google reCAPTCHA", () => {
    const directives = buildContentSecurityPolicyDirectives();

    expect(directives.scriptSrc).toEqual(
      expect.arrayContaining(["https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"])
    );
    expect(directives.frameSrc).toEqual(
      expect.arrayContaining(["https://www.google.com/recaptcha/", "https://recaptcha.google.com/recaptcha/"])
    );
    expect(directives.connectSrc).toContain("https://www.google.com/recaptcha/");
  });

  it("allows the resources required by hCaptcha", () => {
    const directives = buildContentSecurityPolicyDirectives();
    const requiredSources = ["https://hcaptcha.com", "https://*.hcaptcha.com"];

    for (const directive of [directives.scriptSrc, directives.frameSrc, directives.connectSrc, directives.styleSrc]) {
      expect(directive).toEqual(expect.arrayContaining(requiredSources));
    }
  });
});
