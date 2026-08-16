"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/webauthn";

interface Passkey {
  credentialID: string;
  name: string | null;
  createdAt: string;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
}

function describe(passkey: Passkey): string {
  if (passkey.name) return passkey.name;
  // credentialDeviceType is WebAuthn's own vocabulary; "multiDevice" means the
  // credential syncs through a password manager or platform keychain.
  return passkey.credentialBackedUp || passkey.credentialDeviceType === "multiDevice"
    ? "Synced passkey"
    : "Device-bound passkey";
}

export function PasskeySettings() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/passkeys")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) setPasskeys(payload.data.passkeys);
      })
      .catch(() => setPasskeys([]));
  }, []);

  async function load() {
    const res = await fetch("/api/passkeys");
    const payload = await res.json();
    if (payload.success) setPasskeys(payload.data.passkeys);
  }

  async function addPasskey() {
    setBusy(true);
    setError(null);
    try {
      // Logged-in callers must send an explicit action; Auth.js refuses to
      // infer one for an existing session.
      await signIn("passkey", { action: "register", redirect: false });
      await load();
    } catch {
      setError("Passkey registration was cancelled or is unavailable here.");
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(credentialID: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/passkeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialID }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not remove that passkey.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel rounded p-4 sm:p-6">
      <h2 className="text-base font-semibold mb-6">Passkeys</h2>

      <p className="text-sm text-muted mb-5">
        Sign in with Touch ID, Windows Hello, or a security key instead of
        waiting for an email. Magic links keep working, so you are never locked
        out if you lose a device.
      </p>

      {passkeys === null ? (
        <div className="h-16 rounded bg-surface" />
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-muted mb-5">No passkeys registered yet.</p>
      ) : (
        <ul className="mb-5 divide-y divide-border border-y border-border">
          {passkeys.map((passkey) => (
            <li
              key={passkey.credentialID}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {describe(passkey)}
                </p>
                <p className="text-xs text-muted">
                  Added{" "}
                  {new Date(passkey.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void removePasskey(passkey.credentialID)}
                disabled={busy}
                className="text-xs font-medium text-muted hover:text-foreground transition-colors disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => void addPasskey()}
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 rounded bg-accent px-5 py-2.5 text-sm font-semibold text-foreground transition-all disabled:opacity-60"
      >
        {busy ? "Waiting…" : "Add a passkey"}
      </button>

      {error && <p className="mt-3 text-xs text-muted">{error}</p>}
    </section>
  );
}
