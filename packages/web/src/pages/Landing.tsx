import { Link } from "react-router-dom";
import { Logo } from "../components/brand/Logo";
import { Button } from "../components/ui/button";

// Public marketing page served at "/" on the web build. The APK never renders this
// (App.tsx sends native platforms straight to /login). It exists mainly so a first-time
// visitor -- and Razorpay's / Google Play's reviewers -- land on a page that explains the
// service, its pricing, and how to reach the business, instead of a login wall.

const SUPPORT_EMAIL = "agrogamut@gmail.com";
const SUPPORT_PHONE_DISPLAY = "+91 8100540644";
const SUPPORT_PHONE_TEL = "+918100540644";
const BUSINESS_ADDRESS =
  "Shop No. 9, 201 (239) Kamala Abasa, M.B. Road, Nimta, Kolkata, North 24 Parganas, West Bengal, PIN: 700049";

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-display text-lg font-bold text-primary">
        {n}
      </div>
      <h3 className="font-display text-lg font-bold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo className="h-9 w-auto" />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="rounded-full">
            <Link to="/login">Log in</Link>
          </Button>
          <Button asChild className="rounded-full">
            <Link to="/signup">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="flex flex-col items-start gap-6 py-14 sm:py-20">
          <h1 className="font-display text-4xl font-bold leading-tight text-foreground sm:text-5xl">
            Talk to a licensed doctor in minutes.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            MadamGy connects you to a verified doctor for an on-demand video consultation from
            your phone, the web, or a MadamGy kiosk. Get a digital prescription at the end of
            the call and keep every report in one place.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full px-6">
              <Link to="/signup">Start a consultation</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full px-6">
              <Link to="/login">I already have an account</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-10 border-t border-border py-14 sm:grid-cols-3">
          <Step
            n={1}
            title="Sign up with your phone"
            body="Create an account with your mobile number and a one-time code. No app download required on the web."
          />
          <Step
            n={2}
            title="Get matched to a doctor"
            body="Your request joins a queue and the next available verified doctor is paged. Average wait is a few minutes."
          />
          <Step
            n={3}
            title="Consult and get a prescription"
            body="Speak to the doctor over secure video, share reports in chat, and receive a digital prescription immediately after."
          />
        </section>

        <section className="border-t border-border py-14">
          <h2 className="font-display text-2xl font-bold text-foreground">Pricing</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            A single flat consultation fee is charged per completed consultation. The exact
            amount is shown on screen before you confirm payment, and payment is collected
            securely through Razorpay. See our{" "}
            <Link to="/refund-policy" className="text-primary underline">
              refund policy
            </Link>{" "}
            for cancellations and failed consultations.
          </p>
        </section>

        <section className="border-t border-border py-14">
          <h2 className="font-display text-2xl font-bold text-foreground">For doctors</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Licensed practitioners can register to take consultations on MadamGy. Every doctor
            is verified against their degree, medical registration number, and license document
            before approval.
          </p>
          <Button asChild variant="outline" className="mt-4 rounded-full px-6">
            <Link to="/doctor/register">Register as a doctor</Link>
          </Button>
        </section>

        <section className="border-t border-border py-14">
          <h2 className="font-display text-2xl font-bold text-foreground">Contact</h2>
          <p className="mt-3 text-muted-foreground">
            MadamGy is operated by <strong>Agrogamut Services Pvt Ltd</strong>.
          </p>
          <p className="mt-2 text-muted-foreground">
            Email:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p className="mt-2 text-muted-foreground">
            Phone:{" "}
            <a href={`tel:${SUPPORT_PHONE_TEL}`} className="text-primary underline">
              {SUPPORT_PHONE_DISPLAY}
            </a>
          </p>
          <p className="mt-2 text-muted-foreground">{BUSINESS_ADDRESS}</p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Agrogamut Services Pvt Ltd. All rights reserved.
          </p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Link to="/about" className="underline">
              About us
            </Link>
            <Link to="/privacy-policy" className="underline">
              Privacy policy
            </Link>
            <Link to="/terms" className="underline">
              Terms &amp; conditions
            </Link>
            <Link to="/refund-policy" className="underline">
              Refund policy
            </Link>
            <Link to="/delete-account" className="underline">
              Delete account
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
