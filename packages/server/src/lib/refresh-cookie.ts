import type { CookieOptions } from "express";

// In production the web app (Vercel) and this API (Railway) are different *sites*, and the Android
// build's origin is https://localhost -- so a SameSite=Strict/Lax cookie is neither stored nor
// sent on any of those cross-site XHRs. Since auth.store.ts deliberately keeps the access token in
// memory only, an unusable refresh cookie means every reload and every app restart lands on the
// login screen, and any mid-session 401 becomes a hard logout. SameSite=None (which browsers only
// accept alongside Secure) is what makes the cookie work cross-site at all. Locally everything is
// on localhost, i.e. same-site, so Strict still holds there and keeps the tighter default for dev.
//
// SameSite=None does mean another site can cause the browser to attach this cookie to a
// /auth/refresh call, but CORS is pinned to WEB_URL, so such a caller can never read the minted
// tokens out of the response -- there's nothing for it to steal.
//
// Lives here rather than in auth.routes.ts only to stay importable from tests: auth.routes.ts
// imports `io` from index.ts, which imports auth.routes.ts back, so importing it first in a test
// file walks into that cycle mid-initialisation.
export function refreshCookieOptions(): CookieOptions {
  const crossSite = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? "none" : "strict",
  };
}

export const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
