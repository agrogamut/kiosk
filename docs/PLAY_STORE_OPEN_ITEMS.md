# Play Store submission — open items needing your input

Running list. Add to this file whenever a submission blocker needs info only you can provide. Remove a line once resolved and note the resolution inline in the relevant source file instead.

## Blocked on you

- **Support contact email** — `packages/web/src/pages/legal/PrivacyPolicy.tsx` "Contact" section is a placeholder line. Need a real, monitored address before publishing.
- **Production domain live + reachable** — Play Console checks the privacy policy URL at submission time; it must resolve publicly (not localhost/staging-only) when you submit.
- **Legal sign-off on retention wording** — `PrivacyPolicy.tsx` "How long we keep it" section cites general Indian regulation categories (drafted 2026-08-01, see file for current text). A lawyer should confirm the exact retention period and citation apply to this business before this ships — general legal drafting is not a substitute for review.

## Also open (pre-dates this list)

- **Razorpay real API keys** — `.env` has placeholders only (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`), see `CREDENTIALS.local.md`.
- **Play App Signing keystore** — done 2026-08-01, see `CREDENTIALS.local.md` for passwords and backup instructions.
