// The web app and this API are served from different sites in production (Vercel vs Railway), and
// the Android build's origin is https://localhost -- so the refresh cookie only survives that trip
// as SameSite=None; Secure. Getting this wrong doesn't fail any request outright: it just means
// the cookie is never sent back, and since the access token is memory-only, every reload silently
// lands on the login screen. Pin the attributes so that can't regress unnoticed.
import { afterEach, describe, expect, it } from "vitest";
import { refreshCookieOptions } from "../lib/refresh-cookie.js";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("refresh cookie attributes", () => {
  it("is cross-site capable in production", () => {
    process.env.NODE_ENV = "production";

    const options = refreshCookieOptions();

    expect(options.sameSite).toBe("none");
    // Browsers reject SameSite=None unless Secure is set too, so these two must move together.
    expect(options.secure).toBe(true);
    expect(options.httpOnly).toBe(true);
  });

  it("stays strict outside production, where everything is same-site on localhost", () => {
    process.env.NODE_ENV = "development";

    const options = refreshCookieOptions();

    expect(options.sameSite).toBe("strict");
    expect(options.secure).toBe(false);
    expect(options.httpOnly).toBe(true);
  });
});
