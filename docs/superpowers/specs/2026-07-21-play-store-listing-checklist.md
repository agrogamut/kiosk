# Play Store Listing Checklist — MadamGy

Re-check Play Console's current requirements at submission time -- exact pixel
dimensions and policy requirements (especially for "Medical" category apps)
change periodically.

## Assets (blocked on Task 14 -- frontend plan's visual design pass)
- [ ] App icon (512x512 PNG, 32-bit with alpha) -- use the icon Task 14 produces,
      not the default Capacitor placeholder in `packages/kiosk-android/android/app/src/main/res/mipmap-*`.
- [ ] Feature graphic (1024x500 PNG or JPEG).
- [ ] Phone screenshots, minimum 2, using the real designed UI: patient OTP login,
      patient dashboard, consult/video call screen, doctor dashboard, patient
      history panel.
- [ ] Short description (max 80 characters).
- [ ] Full description (max 4000 characters).

## Store listing metadata
- [ ] Category: likely "Medical" -- re-check Play's current Medical apps policy
      at submission time; it periodically adds certification/documentation
      requirements (e.g. proof of medical licensing/regulatory compliance in
      the operating region) beyond a normal app submission.
- [ ] Content rating questionnaire completed.
- [ ] Privacy policy URL: the public URL for the page built in Task 4
      (`/privacy-policy`) -- confirm it's actually publicly reachable before
      pasting the URL into Play Console, not just working in local dev.
- [ ] Data Safety form filled in from `2026-07-21-play-store-data-safety-mapping.md` (Task 6).
- [ ] App signing enrolled per `2026-07-21-play-app-signing-runbook.md` (Task 7).
- [ ] Target API level meets Play's current minimum (check against
      `packages/kiosk-android/android/variables.gradle`'s `targetSdkVersion`
      -- was 36 as of the Capacitor scaffold on 2026-07-21 -- against Play's
      current minimum requirement at submission time).

## Account deletion / data safety cross-links Play reviewers check
- [ ] Account deletion web URL (`/delete-account`, Task 3) is reachable and
      works without the app installed -- test from a browser Google's
      reviewers would plausibly use, not just localhost.
- [ ] In-app deletion control (Task 5) is reachable from a logged-in session
      without contacting support.
