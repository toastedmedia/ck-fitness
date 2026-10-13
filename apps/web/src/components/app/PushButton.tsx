"use client";
import { useEffect, useState } from "react";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

type State = "loading" | "unsupported" | "blocked" | "off" | "on";

/** Switches push notifications on or off for this device only. */
export function PushButton({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  async function turnOn() {
    setBusy(true);
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toKey(publicKey),
        }));
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("save");
      setState("on");
    } catch {
      setMsg("We could not turn that on. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setMsg("We could not turn that off. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;
  const note =
    state === "unsupported"
      ? "This browser can't show push notifications. On iPhone, add the app to your Home Screen first."
      : state === "blocked"
        ? "Notifications are blocked for this site. Allow them in your browser settings, then come back."
        : state === "on"
          ? "Push is on for this device."
          : "Get reminders and replies on this device, even when the app is closed.";
  return (
    <div className="mt-1 rounded-2xl border-2 border-line p-3">
      <p className="text-xs text-muted" aria-live="polite">
        {note} {msg}
      </p>
      {state === "off" || state === "on" ? (
        <button
          type="button"
          disabled={busy}
          onClick={state === "on" ? turnOff : turnOn}
          className="mt-2 min-h-11 rounded-button border-2 border-line px-4 text-xs font-bold text-brand disabled:opacity-60"
        >
          {state === "on" ? "Turn off on this device" : "Turn on for this device"}
        </button>
      ) : null}
    </div>
  );
}
