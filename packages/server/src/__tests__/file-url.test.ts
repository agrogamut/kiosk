import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { signAccessToken } from "../services/auth.service.js";
import { buildFileUrl, signFileToken } from "../services/file-url.service.js";
import { deleteObject, ensureBucket, uploadBuffer } from "../services/storage.service.js";

// The whole point of this route is that it works without an Authorization header: an <img src>
// or a link sends none, and the bucket it fronts is not reachable from a browser at all.
describe("GET /api/files/:token", () => {
  const objectKey = "chat/file-url-test/hello.txt";
  const body = "hello from object storage";

  beforeAll(async () => {
    await ensureBucket();
    await uploadBuffer(objectKey, Buffer.from(body), "text/plain");
  });

  afterAll(async () => {
    await deleteObject(objectKey).catch(() => undefined);
  });

  it("streams the object to a caller holding only the signed token", async () => {
    const token = signFileToken({ k: objectKey }, 60);

    const response = await request(app).get(`/api/files/${token}`).expect(200);

    expect(response.text).toBe(body);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.headers["content-disposition"]).toBe("inline");
    // Uploads are arbitrary user files served from the API's own origin; without these an SVG
    // or HTML attachment would execute script there.
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toContain("sandbox");
    // helmet's same-origin default would stop the web app and the APK -- both on other origins --
    // rendering these at all.
    expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("forces a download when the caller asked for one", async () => {
    const token = signFileToken({ k: objectKey, d: "license-document" }, 60);

    const response = await request(app).get(`/api/files/${token}`).expect(200);

    expect(response.headers["content-disposition"]).toBe('attachment; filename="license-document"');
  });

  it("rejects an expired token", async () => {
    const token = signFileToken({ k: objectKey }, -1);

    await request(app).get(`/api/files/${token}`).expect(403);
  });

  it("rejects a token signed with the wrong key", async () => {
    // An access token is signed with JWT_ACCESS_SECRET directly; file tokens use a key derived
    // from it, so neither can ever be replayed as the other.
    const accessToken = signAccessToken({ sub: "someone", role: "PATIENT" });

    await request(app).get(`/api/files/${accessToken}`).expect(403);
  });

  it("404s for a token naming an object that does not exist", async () => {
    const token = signFileToken({ k: "chat/file-url-test/missing.txt" }, 60);

    await request(app).get(`/api/files/${token}`).expect(404);
  });

  it("builds an absolute URL honouring the proxy's forwarded protocol", () => {
    // Railway terminates TLS in front of the API, so req.protocol alone reports http and every
    // generated URL would be blocked as mixed content on the https web app.
    const req = {
      get: (name: string) => (name === "x-forwarded-proto" ? "https" : "api.example.com"),
      protocol: "http",
    } as unknown as Parameters<typeof buildFileUrl>[0];

    expect(buildFileUrl(req, objectKey)).toMatch(/^https:\/\/api\.example\.com\/api\/files\/.+/);
  });
});
