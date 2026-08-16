"use client";

import { useState } from "react";
// Not next-auth/react — its signIn() throws for WebAuthn providers and points
// here instead. This entry point runs the browser credential ceremony first.
import { signIn } from "next-auth/webauthn";

export function PasskeySignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      // No action given, so the server infers "authenticate". The passkey
      // provider uses discoverable credentials, so no email is needed first.
      await signIn("passkey", { redirectTo: callbackUrl });
    } catch {
      // Cancelling the OS prompt rejects here; that is not worth an alarming
      // message, so keep it soft and let them try again or use email.
      setError("Passkey sign-in was cancelled or is unavailable on this device.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 rounded border border-border bg-surface px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-accent/40 disabled:opacity-60"
      >
        {busy ? "Waiting for your passkey…" : "Sign in with a passkey"}
      </button>

      {error && <p className="text-xs text-muted text-center">{error}</p>}
    </div>
  );
}
