# Play Store submission — open items needing your input

Running list. Add to this file whenever a submission blocker needs info only you can provide. Remove a line once resolved and note the resolution inline in the relevant source file instead.

## Blocked on you

- **Production domain live + reachable** — Play Console checks the privacy policy URL at submission time; it must resolve publicly (not localhost/staging-only) when you submit.
- **Legal sign-off on retention wording** — `PrivacyPolicy.tsx` "How long we keep it" section cites general Indian regulation categories (drafted 2026-08-01, see file for current text). A lawyer should confirm the exact retention period and citation apply to this business before this ships — general legal drafting is not a substitute for review.
- **Registered business address** — About/Contact pages give the support email only (`agrogamut@gmail.com`); no physical address is on file. Add one if Play Console or Razorpay verification asks for it.

## Also open (pre-dates this list)

- **Play App Signing keystore** — done 2026-08-01, see `CREDENTIALS.local.md` for passwords and backup instructions.

## Resolved

- **Support contact email** — set to `agrogamut@gmail.com` (2026-08-27) in `PrivacyPolicy.tsx`, `AboutUs.tsx`, `Terms.tsx`, `RefundPolicy.tsx`, and `ContactUsDialog.tsx`.
- **Razorpay real API keys** — test-mode keys set in Railway (`kiosk` service) 2026-08-27. Live-mode keys still pending Razorpay business verification.
- **About/Terms/Refund pages + footer links** — added 2026-08-27 (`/about`, `/terms`, `/refund-policy`), linked from the Entry page alongside the existing privacy policy link, needed for both Razorpay website verification and Play Store review.
