# Go-live checklist — first real test on prod

State as of 2026-08-10. Prod pieces that already exist:

- API: `https://kiosk-production-060d.up.railway.app` (Railway) — `/api/health` reports `db`, `redis`, `minio` all healthy.
- Web: `https://madamgy-web.vercel.app` (Vercel) — bundle correctly points at the Railway API.
- Android: signed release APK built by the `build-android-release-apk` CI job.

What follows is the set of things that were **not** in place, split into what has been fixed in
code and what still needs to be done in the Railway/Vercel/LiveKit dashboards.

## Fixed in code (ships on next deploy)

| Problem | Effect before the fix | Fix |
| --- | --- | --- |
| Refresh cookie was `SameSite=Strict` while web and API are on different sites | Cookie never sent cross-site. The access token is deliberately memory-only, so *every* reload and app restart dropped you back to the login screen, and any mid-session 401 became a hard logout. Fully dead inside the APK (`https://localhost` origin). | `packages/server/src/lib/refresh-cookie.ts` — `SameSite=None; Secure` in production, `Strict` elsewhere. Logout clears with matching attributes. |
| CORS allowed exactly one origin | The APK's WebView origin is `https://localhost`, never the Vercel URL, so every API call and socket handshake from the installed app was blocked. Website unaffected — which is why this hides until you test on a phone. | `packages/server/src/index.ts` — `WEB_URL` now takes a comma-separated list, and the Capacitor origins are always allowed on top. |
| `VITE_LIVEKIT_URL` unset in the Vercel build and in both CI APK jobs | Shipped bundle dialled `ws://localhost:7880`. No call could ever connect, on web or APK. Verified present in the currently deployed bundle. | CI jobs now pass `VITE_LIVEKIT_URL` from the `LIVEKIT_WS_URL` secret; `packages/web/src/lib/livekitUrl.ts` logs a loud console error if a production build ever ships without it again. |
| No way to get a testable doctor without the full flow | Doctor sign-up is a ~20-field form plus a SUPER_ADMIN approval, all of which needs a working admin login first. | `npm run db:seed:doctor --workspace @madamgy/server` creates an already-approved doctor. Re-runnable: resets the password and re-approves an existing one. |

## LiveKit — done, except the webhook

A LiveKit Cloud project (`kiosk-iq6jq9cr`) now backs the deployment. Configured on 2026-08-10:

- **Railway**: `LIVEKIT_HOST`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Note the server reads
  `LIVEKIT_HOST` — LiveKit's own dashboard calls the same value `LIVEKIT_URL`.
- **Vercel**: `VITE_LIVEKIT_URL` (Production).
- **CI**: inlined in both APK jobs. It is deliberately not a secret — this is the public signalling
  URL every client dials, and it is useless without the key/secret, which stay server-side.

Vite inlines `VITE_*` at build time, so a Vercel redeploy and an APK rebuild are what actually put
the URL into the shipped bundles. Changing the variable alone does nothing to an existing build.

### Still to do: the LiveKit webhook

In the LiveKit Cloud project settings, add a webhook pointing at
`https://kiosk-production-060d.up.railway.app/api/webhooks/livekit`, signed with the same API key.
Without it, a room LiveKit ends on its own (the 2-minute departure timeout) never gets marked
complete server-side, so the call stays ACTIVE and the doctor is never credited.

### 2. Confirm the Railway variables that already matter

```
WEB_URL=https://madamgy-web.vercel.app     # exact origin, no trailing slash
NODE_ENV=production                        # gates the SameSite=None cookie — must be exactly this
ADMIN_PHONE / ADMIN_PASSWORD               # seeds SUPER_ADMIN on every boot
REQUIRE_PAYMENT_FOR_CALLS=false            # leave false until Razorpay keys are real
STALE_CALL_REAPER_ENABLED=false
MSG91_AUTH_KEY / MSG91_TEMPLATE_ID         # doctor login is OTP-only; no SMS, no doctor
```

The admin account almost certainly exists already: the container's start command runs the seed
before the server, and the seed exits non-zero when `ADMIN_PHONE`/`ADMIN_PASSWORD` are missing —
which would stop the server from starting at all. It is up, so the seed ran.

### 3. Create the test doctor

From a shell with `DATABASE_URL` pointing at the prod database (Railway shell, or locally with the
prod connection string):

```fish
env DOCTOR_PHONE=<a real phone that receives SMS> DOCTOR_PASSWORD=<8+ chars> DOCTOR_NAME="Dr Test" \
  npm run db:seed:doctor --workspace @madamgy/server
```

The phone must be real — doctor login is password **then** an SMS OTP.

## Test run: doctor + patient from one phone

Two sessions cannot share one app install: the auth store and the refresh cookie are both
per-origin, and `api.ts` deliberately logs out when it notices the refresh cookie switched
accounts. Use two separate storage containers on the same handset:

1. **Patient** — the installed APK. Open it, sign up as a new patient (sign-up is the default view
   and issues a token directly, so no OTP needed for a brand-new patient).
2. **Doctor** — Chrome on the same phone → `https://madamgy-web.vercel.app/?role=doctor`. Phone +
   password, then the SMS OTP. Land on `/doctor`, make sure availability is on.
3. Patient taps consult → doctor's dashboard rings → accept → both join the LiveKit room.

Watch out for one trap: signing in as **Kiosk Owner** on a device prompts "Make this device a
kiosk?", and accepting locks that install to the patient screen for good (long-press the logo to
get back). For a plain test run, choose "Just sign me in".

## Known-not-done

- Razorpay keys are still placeholders — keep `REQUIRE_PAYMENT_FOR_CALLS=false`.
- Privacy policy contact email is still a placeholder (`docs/PLAY_STORE_OPEN_ITEMS.md`).
