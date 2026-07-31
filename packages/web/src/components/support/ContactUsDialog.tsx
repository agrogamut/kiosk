import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { ContactMessageCreateSchema } from "@madamgy/api-client";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface ContactUsDialogProps {
  trigger: ReactNode;
  defaultName?: string;
  defaultPhone?: string;
}

export function ContactUsDialog({ trigger, defaultName = "", defaultPhone = "" }: ContactUsDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function reset(): void {
    setName(defaultName);
    setPhone(defaultPhone);
    setMessage("");
    setFieldError(null);
  }

  async function submit(): Promise<void> {
    const parsed = ContactMessageCreateSchema.safeParse({ name, phone, message });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }

    setFieldError(null);
    setSubmitting(true);
    try {
      await api.post("/support/contact", parsed.data);
      toast.success("Message sent. We'll get back to you soon.");
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not send your message. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact us</DialogTitle>
          <DialogDescription>Tell us what's going on and we'll follow up on this number.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-name">Name</Label>
            <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-phone">Phone number</Label>
            <Input id="contact-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-message">What's the issue?</Label>
            <Textarea
              id="contact-message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe what's going wrong..."
            />
          </div>
          {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={submitting} className="w-full rounded-full">
            {submitting ? "Sending..." : "Send message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
