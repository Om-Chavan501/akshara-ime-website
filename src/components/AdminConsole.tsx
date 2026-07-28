import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Session } from "@supabase/supabase-js";
import {
  supabase, SUPABASE_URL, SUPABASE_ANON_KEY,
  holdsSlot, type Device, type License,
} from "../lib/supabase";

/**
 * Support console.
 *
 * Rebuilt rather than restyled. The first version was functionally correct and visually
 * unconsidered, and it only did two things (look someone up, move a licence to a corrected
 * email) — every other support request either went unactioned or got resolved by hand
 * against the database, which is risky and leaves no trace.
 *
 * Design stance: this is an internal tool where being *wrong* is far more expensive than
 * being slow. So every destructive action states its consequence in plain words, requires a
 * typed reason, and confirms before firing. Nothing here optimises for speed of clicking.
 *
 * Access is enforced server-side by an ADMIN_EMAILS allowlist checked against a verified
 * JWT; non-admins get a 404 from the endpoint. The page being reachable is not a leak —
 * it's just a form that nobody unauthorised can make do anything.
 */

interface Order {
  paddle_transaction_id: string | null;
  email: string | null;
  max_devices: number;
  amount: string | null;
  currency: string | null;
  created_at: string;
}

interface HistoryEntry {
  action: string;
  detail: Record<string, unknown>;
  reason: string | null;
  performed_by: string;
  created_at: string;
}

interface LookupResult {
  found: boolean;
  reason?: string;
  user_id: string;
  email: string;
  licenses: License[];
  devices: Device[];
  orders: Order[];
  history: HistoryEntry[];
}

type Busy = string | null;

/**
 * An action waiting for the operator to confirm it.
 *
 * Everything destructive goes through this one shape, so no action can accidentally ship
 * without a stated consequence and a recorded reason — the two things that make a support
 * trail worth having. `payload` is a function because some actions need the value the
 * operator typed into the sheet.
 */
interface Pending {
  key: string;
  title: string;
  /** What actually happens, in plain words. Shown before the operator can confirm. */
  consequence: string;
  confirmLabel: string;
  danger?: boolean;
  /** Present when the action needs a number (currently only the device cap). */
  field?: { label: string; initial: string; hint?: string };
  success: string;
  payload: (value: string, reason: string) => Record<string, unknown>;
}

export default function AdminConsole() {
  const reduced = useReducedMotion();
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<"loading" | "email" | "code" | "ready">("loading");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setPhase(data.session ? "ready" : "email");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setPhase(s ? "ready" : "email");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* ----------------------------------------------------------------- admin API */

  const callAdmin = useCallback(async (payload: Record<string, unknown>) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Your session expired — sign in again.");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  }, []);

  /**
   * `keepNotice` is set when this is the refresh that follows a completed action. Without it
   * the refresh clears the very message confirming what just happened, and the operator is
   * left looking at changed numbers with no statement that the action succeeded — which
   * reads as "did that work?" and invites doing it twice.
   */
  const lookup = useCallback(async (raw?: string, keepNotice = false) => {
    const q = (raw ?? query).trim();
    if (!q) return;
    setBusy("lookup"); setError(null);
    if (!keepNotice) setNotice(null);
    try {
      // A Paddle transaction id is unmistakable (`txn_` + ULID), so the field accepts either
      // and routes on shape. Making the operator pick the right box first would be pure
      // friction — they're pasting whatever the customer sent them.
      const payload = q.startsWith("txn_")
        ? { action: "lookup", transaction_id: q }
        : { action: "lookup", email: q };
      const { ok, status, body } = await callAdmin(payload);

      if (status === 404 && body.error === "not found") {
        setError("This account isn't authorised for support access.");
        setResult(null);
      } else if (!ok) {
        setError(body.error ?? "Lookup failed.");
        setResult(null);
      } else if (!body.found) {
        setError(body.reason ?? "No customer found.");
        setResult(null);
      } else {
        setResult(body);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [query, callAdmin]);

  /**
   * Runs a confirmed action, then re-reads the customer so the view can never show stale
   * state. Re-reading rather than patching locally is deliberate: several of these actions
   * have effects the response doesn't describe (releasing a slot changes what the cap check
   * will allow next), and a console that disagrees with the database is worse than a slow one.
   */
  async function run(pending: Pending, reason: string, value: string) {
    const payload = pending.payload(value, reason);
    setConfirming(null);
    setBusy(pending.key); setError(null); setNotice(null);
    try {
      const { ok, body } = await callAdmin(payload);
      if (!ok) {
        setError([body.error, body.detail].filter(Boolean).join(" — ") || "Action failed.");
        return;
      }
      setNotice(body.note ? `${pending.success} ${body.note}` : pending.success);
      // Surfaced rather than swallowed: the change did happen, but an unlogged admin action
      // is exactly the thing this table exists to prevent.
      if (body.audit_recorded === false) {
        setNotice((n) => `${n} (Warning: the audit record failed to write — note it manually.)`);
      }
      await lookup(result?.email, true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /**
   * `?q=…` prefills and runs a lookup, so a support ticket can carry a link straight to the
   * customer rather than an address to re-type. Runs once, only after a session exists.
   */
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (!session || deepLinked) return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (!q) return;
    setDeepLinked(true);
    setQuery(q);
    lookup(q);
  }, [session, deepLinked, lookup]);

  /* ----------------------------------------------------------------- auth */

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setAuthBusy(true); setAuthError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setAuthBusy(false);
    if (error) return setAuthError(error.message);
    setPhase("code");
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setAuthBusy(true); setAuthError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(), token: code.trim(), type: "email",
    });
    setAuthBusy(false);
    if (error) setAuthError("That code didn't work.");
  }

  const fade = reduced ? {} : {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const },
  };

  if (phase === "loading") return <div className="adm-skel" aria-busy="true" />;

  /* ----------------------------------------------------------------- signed out */

  if (!session) {
    return (
      <div className="adm">
        <h1>Support console</h1>
        <p className="lede adm-lede">Restricted to the administrator account.</p>
        <div className="adm-card">
          {phase === "email" ? (
            <form onSubmit={sendCode}>
              <label htmlFor="adm-email">Email address</label>
              <input id="adm-email" type="email" autoComplete="email" required
                     value={email} onChange={(e) => setEmail(e.target.value)}
                     placeholder="you@example.com" disabled={authBusy} />
              <button className="btn btn-primary full" disabled={authBusy || !email.trim()}>
                {authBusy ? "Sending…" : "Send code"}
              </button>
            </form>
          ) : (
            <form onSubmit={verify}>
              <label htmlFor="adm-code">Code sent to {email}</label>
              <input id="adm-code" type="text" inputMode="numeric" autoComplete="one-time-code"
                     required value={code} onChange={(e) => setCode(e.target.value)}
                     placeholder="123456" maxLength={6} disabled={authBusy} />
              <button className="btn btn-primary full" disabled={authBusy || !code.trim()}>
                {authBusy ? "Checking…" : "Verify"}
              </button>
              <button type="button" className="linkish" style={{ marginTop: "var(--space-3)" }}
                      onClick={() => { setPhase("email"); setCode(""); setAuthError(null); }}>
                Use a different email
              </button>
            </form>
          )}
          {authError && <p className="msg err" role="alert">{authError}</p>}
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------------- console */

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1>Support console</h1>
          <p className="muted small">{session.user.email}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>

      <form className="adm-search" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
        <label htmlFor="adm-q">Find a customer</label>
        <div className="adm-search-row">
          <input id="adm-q" type="text" value={query} placeholder="email address or txn_01…"
                 onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          <button className="btn btn-primary" disabled={busy === "lookup" || !query.trim()}>
            {busy === "lookup" ? "Looking…" : "Look up"}
          </button>
        </div>
        <p className="hint">
          Either an email address or a Paddle transaction id — a transaction id resolves to
          the account even when the customer can't tell you which address they used.
        </p>
      </form>

      <div aria-live="polite">
        {error && <p className="msg err" role="alert">{error}</p>}
        {notice && <p className="msg ok">{notice}</p>}
      </div>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div key={result.user_id} {...fade}>

            {/* ---- who ---- */}
            <section className="adm-card">
              <h2>Customer</h2>
              <dl className="kv">
                <dt>Email</dt><dd>{result.email}</dd>
                <dt>Account id</dt><dd className="mono">{result.user_id}</dd>
              </dl>
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy === "resend"}
                onClick={() => setConfirming({
                  key: "resend",
                  title: "Resend purchase email",
                  consequence:
                    `Sends the download link and setup steps to ${result.email} again. ` +
                    `Safe to repeat — it doesn't change their licence.`,
                  confirmLabel: "Send it",
                  success: "Purchase email resent.",
                  payload: (_v, reason) => ({
                    action: "resend_welcome", user_id: result.user_id, reason,
                  }),
                })}>
                {busy === "resend" ? "Sending…" : "Resend purchase email"}
              </button>
            </section>

            {/* ---- licences ---- */}
            <h2 className="adm-section-title">Licences</h2>
            {result.licenses.length === 0 && (
              <p className="adm-empty">
                No licence on this account. If they've paid, check the orders below — the
                webhook may not have matched them.
              </p>
            )}

            {result.licenses.map((lic) => {
              const devices = result.devices.filter((d) => d.license_id === lic.id);
              const used = devices.filter(holdsSlot).length;
              return (
                <section className="adm-card" key={lic.id}>
                  <div className="lic-top">
                    <div>
                      <span className={`pill pill-${lic.status}`}>{lic.status}</span>
                      <span className="pill pill-kind">{lic.kind}</span>
                    </div>
                    <span className="muted small mono">{lic.id}</span>
                  </div>

                  <p className="lic-slots">
                    <strong>{used}</strong> of <strong>{lic.max_devices}</strong> device
                    slots in use
                  </p>

                  <div className="adm-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy === `cap-${lic.id}`}
                      onClick={() => setConfirming({
                        key: `cap-${lic.id}`,
                        title: "Change device cap",
                        consequence:
                          `How many Macs this licence may run on at once. ` +
                          `It can't go below the ${used} currently in use — release a device first.`,
                        confirmLabel: "Update cap",
                        field: {
                          label: "Devices allowed",
                          initial: String(lic.max_devices),
                          hint: `Currently ${lic.max_devices}, with ${used} in use.`,
                        },
                        success: "Device cap updated.",
                        payload: (value, reason) => ({
                          action: "set_max_devices", license_id: lic.id,
                          max_devices: Number(value), reason,
                        }),
                      })}>
                      Change device cap
                    </button>

                    {lic.status === "active" ? (
                      <button
                        className="btn btn-sm danger-btn"
                        disabled={busy === `status-${lic.id}`}
                        onClick={() => setConfirming({
                          key: `status-${lic.id}`,
                          title: "Suspend this licence",
                          consequence:
                            "Their Macs stop converting at their next check-in — not instantly, " +
                            "so an offline Mac keeps working until it reconnects. Reversible.",
                          confirmLabel: "Suspend",
                          danger: true,
                          success: "Licence suspended.",
                          payload: (_v, reason) => ({
                            action: "set_license_status", license_id: lic.id,
                            status: "revoked", reason,
                          }),
                        })}>
                        Suspend
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busy === `status-${lic.id}`}
                        onClick={() => setConfirming({
                          key: `status-${lic.id}`,
                          title: "Restore this licence",
                          consequence:
                            "Puts the licence back to active. Their Macs resume at their next " +
                            "check-in. If it was marked refunded, that mark is cleared too.",
                          confirmLabel: "Restore",
                          success: "Licence restored.",
                          payload: (_v, reason) => ({
                            action: "set_license_status", license_id: lic.id,
                            status: "active", reason,
                          }),
                        })}>
                        Restore to active
                      </button>
                    )}
                  </div>

                  {/* ---- devices ---- */}
                  {devices.length > 0 && (
                    <ul className="devlist">
                      {devices.map((d) => {
                        const active = holdsSlot(d);
                        const state = d.force_released_at ? "Slot released"
                          : d.revoked_confirmed_at ? "Stopped and confirmed"
                          : d.deactivated_at && active ? "Deactivated — slot held until lease expires"
                          : d.deactivated_at ? "Deactivated"
                          : active ? "Active" : "Lease expired";
                        return (
                          <li className="dev" key={d.id}>
                            <div>
                              <strong>{d.name ?? "Unnamed Mac"}</strong>
                              <p className="muted small">
                                {state}
                                {d.last_checkin_at && ` · checked in ${rel(d.last_checkin_at)}`}
                              </p>
                            </div>
                            {!d.force_released_at && (
                              <button
                                className="btn btn-sm danger-btn"
                                disabled={busy === `rel-${d.id}`}
                                onClick={() => setConfirming({
                                  key: `rel-${d.id}`,
                                  title: `Force-release ${d.name ?? "this Mac"}`,
                                  consequence:
                                    "Frees the slot immediately so they can activate a " +
                                    "replacement. Until that Mac next reaches the internet, " +
                                    "both it and the replacement can run — which is why this " +
                                    "is for lost, dead or wiped machines, not routine swaps. " +
                                    "It does not use up the customer's own 3-per-year allowance.",
                                  confirmLabel: "Release the slot",
                                  danger: true,
                                  success: "Slot released.",
                                  payload: (_v, reason) => ({
                                    action: "force_release", device_id: d.id, reason,
                                  }),
                                })}>
                                Force-release
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}

            {/* ---- orders ---- */}
            <h2 className="adm-section-title">Orders</h2>
            {result.orders.length === 0
              ? <p className="adm-empty">No orders recorded against this account.</p>
              : (
                <section className="adm-card">
                  <ul className="plain">
                    {result.orders.map((o) => (
                      <li className="ord" key={o.paddle_transaction_id ?? o.created_at}>
                        <div>
                          <span className="mono small">{o.paddle_transaction_id ?? "—"}</span>
                          <p className="muted small">{fmt(o.created_at)} · {o.max_devices} device(s)</p>
                        </div>
                        <span>{money(o.amount, o.currency)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

            {/* ---- what support already did ---- */}
            <h2 className="adm-section-title">Support history</h2>
            {result.history.length === 0
              ? <p className="adm-empty">Nothing has been actioned on this account.</p>
              : (
                <section className="adm-card">
                  <ul className="plain">
                    {result.history.map((h, i) => (
                      <li className="hist" key={i}>
                        <div>
                          <strong>{h.action.replace(/_/g, " ")}</strong>
                          {h.detail && Object.keys(h.detail).length > 0 && (
                            <span className="muted small"> · {describe(h.detail)}</span>
                          )}
                          <p className="muted small">
                            {fmt(h.created_at)} · {h.performed_by}
                            {h.reason && ` · “${h.reason}”`}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmSheet
        pending={confirming}
        reduced={!!reduced}
        onCancel={() => setConfirming(null)}
        onConfirm={(reason, value) => confirming && run(confirming, reason, value)}
      />
    </div>
  );
}

/**
 * One confirmation surface for every action.
 *
 * The reason field is required, not optional. A support trail whose entries mostly say
 * nothing is barely better than no trail, and the friction of one sentence is trivial next
 * to the cost of not knowing later why someone's licence was suspended.
 */
function ConfirmSheet({ pending, reduced, onCancel, onConfirm }: {
  pending: Pending | null;
  reduced: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, value: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [value, setValue] = useState("");

  useEffect(() => {
    setReason("");
    setValue(pending?.field?.initial ?? "");
  }, [pending]);

  // Escape closes it. Expected of anything modal, and it's the fastest way out of an action
  // opened by mistake.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onCancel]);

  const ready = reason.trim().length > 0 && (!pending?.field || value.trim().length > 0);

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          className="sheet-scrim"
          initial={reduced ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onCancel}
        >
          <motion.div
            className="sheet"
            role="dialog" aria-modal="true" aria-labelledby="sheet-title"
            initial={reduced ? {} : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="sheet-title">{pending.title}</h2>
            <p className="sheet-consequence">{pending.consequence}</p>

            <form onSubmit={(e) => { e.preventDefault(); if (ready) onConfirm(reason.trim(), value.trim()); }}>
              {pending.field && (
                <>
                  <label htmlFor="sheet-value">{pending.field.label}</label>
                  <input id="sheet-value" type="number" min={1} max={10} value={value}
                         onChange={(e) => setValue(e.target.value)} autoFocus />
                  {pending.field.hint && <p className="hint">{pending.field.hint}</p>}
                </>
              )}

              <label htmlFor="sheet-reason">Reason</label>
              <input id="sheet-reason" type="text" value={reason} required
                     placeholder="e.g. Mac stolen, confirmed by customer"
                     onChange={(e) => setReason(e.target.value)}
                     autoFocus={!pending.field} />
              <p className="hint">Recorded in the support history against this account.</p>

              <div className="sheet-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
                  Cancel
                </button>
                <button type="submit" disabled={!ready}
                        className={pending.danger ? "btn btn-sm danger-btn" : "btn btn-primary btn-sm"}>
                  {pending.confirmLabel}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Paddle records totals as a string in the currency's smallest unit ("149900" = ₹1,499.00),
 * which the webhook stores verbatim. Formatting it properly matters here: an operator
 * comparing what support shows against what the customer was charged shouldn't have to
 * work out where the decimal point goes.
 */
function money(amount: string | null, currency: string | null) {
  if (!amount || !currency) return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n / 100);
  } catch {
    return `${currency} ${(n / 100).toFixed(2)}`;
  }
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

function rel(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Renders an audit row's before/after without needing a case per action type. */
function describe(detail: Record<string, unknown>) {
  if ("from" in detail && "to" in detail) return `${detail.from} → ${detail.to}`;
  return Object.entries(detail).map(([k, v]) => `${k}: ${v}`).join(", ");
}
