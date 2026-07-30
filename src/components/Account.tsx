import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Session } from "@supabase/supabase-js";
import {
  supabase, SUPABASE_URL, SUPABASE_ANON_KEY, PADDLE_CLIENT_TOKEN, PRICE_IDS, TIERS,
  holdsSlot, type License, type Device,
} from "../lib/supabase";

/**
 * Account: sign in → buy → manage devices.
 *
 * Auth comes BEFORE purchase deliberately. Previously the licence was created against
 * whatever address was typed into Paddle's checkout, so a typo produced a licence on an
 * email nobody could ever sign in to — money taken, product undeliverable, and no way for
 * the buyer to notice. Signing in first means the address is already proven deliverable, and
 * the webhook attaches the licence to the authenticated account rather than to typed text.
 */

type Phase = "loading" | "email" | "code" | "ready";

declare global { interface Window { Paddle?: any } }

export default function Account() {
  // What this visitor will actually be charged, keyed by price id. Paddle is USD-based with
  // an India-only INR override, so showing "₹1,499 / $29" to everyone means the buy button
  // and the checkout quote different things — on the page where money changes hands.
  const [prices, setPrices] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch(`${SUPABASE_URL}/functions/v1/price-preview`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.items) return;
        const next: Record<string, string> = {};
        for (const i of d.items) if (i.price_id && i.total) next[i.price_id] = i.total;
        setPrices(next);
      })
      // Falls back to the TIERS figures, which are real prices — just not necessarily this
      // visitor's currency.
      .catch(() => {});
  }, []);

  // Drop the server-rendered fallback (see account.astro). Done on mount rather than with
  // CSS so it also disappears when the island is slow rather than absent — the fallback's
  // whole job is to be the thing you see when this component isn't there yet.
  useEffect(() => {
    document.getElementById("acct-fallback")?.remove();
  }, []);

  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const [license, setLicense] = useState<License | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingLicense, setLoadingLicense] = useState(false);

  /* ------------------------------------------------------------------ session */

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

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /* ------------------------------------------------------------------ licence */

  const loadLicense = useCallback(async () => {
    if (!session) return;
    setLoadingLicense(true);
    const { data: lic } = await supabase
      .from("licenses").select("*").eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    setLicense(lic ?? null);
    if (lic) {
      const { data: devs } = await supabase
        .from("devices").select("*").eq("license_id", lic.id)
        .order("last_seen_at", { ascending: false });
      setDevices(devs ?? []);
    } else {
      setDevices([]);
    }
    setLoadingLicense(false);
  }, [session]);

  useEffect(() => { if (session) loadLicense(); }, [session, loadLicense]);

  /* ------------------------------------------------------------------ Paddle */

  useEffect(() => {
    if (!session || window.Paddle) return;
    const s = document.createElement("script");
    s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    s.onload = () => {
      window.Paddle.Environment.set("production");
      window.Paddle.Initialize({ token: PADDLE_CLIENT_TOKEN });
    };
    document.head.appendChild(s);
  }, [session]);

  function buy(devices: number) {
    if (!window.Paddle || !session?.user.email) return;
    window.Paddle.Checkout.open({
      items: [{ priceId: PRICE_IDS[devices], quantity: 1 }],
      // Prefilled from the signed-in account. Even if Paddle lets it be edited, the webhook
      // reconciles to the authenticated user, so the licence cannot land on a typo.
      customer: { email: session.user.email },
      settings: { successUrl: "https://akshara-ime.com/success.html" },
    });
  }

  /* ------------------------------------------------------------------ actions */

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (error) return setError(error.message);
    setPhase("code");
    setCooldown(30);
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(), token: code.trim(), type: "email",
    });
    setBusy(false);
    if (error) setError("That code didn't work. Check it and try again.");
  }

  async function google() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account.html` },
    });
    if (error) setError(error.message);
  }

  async function deactivate(d: Device) {
    setError(null); setNotice(null);
    const { error } = await supabase.rpc("deactivate_device", { p_device_id: d.id });
    if (error) return setError(error.message);
    setNotice(
      `${d.name ?? "That Mac"} will stop converting the next time it's online. ` +
      `Its slot frees up as soon as it confirms — or within 5 days if it never comes back.`
    );
    loadLicense();
  }

  /// Undoes a deactivation the target Mac hasn't acted on yet (migration 0011).
  async function cancelDeactivation(d: Device) {
    setError(null); setNotice(null);
    const { error } = await supabase.rpc("cancel_deactivation", { p_device_id: d.id });
    if (error) {
      // The window closes on its own, so the failure is expected rather than exceptional:
      // that Mac connected and acted on the deactivation between the click and the undo.
      return setError(
        `${d.name ?? "That Mac"} has already stopped — it connected before you undid this. ` +
        `Activate it again from that Mac to carry on using it.`
      );
    }
    setNotice(`${d.name ?? "That Mac"} is active again — the deactivation was undone in time.`);
    loadLicense();
  }

  async function forceRelease(d: Device) {
    if (!confirm(
      `Release ${d.name ?? "this Mac"}'s slot immediately?\n\n` +
      `Only do this for a Mac you can't get back — lost, stolen or dead. ` +
      `You get 3 of these a year.`
    )) return;
    setError(null); setNotice(null);
    const { error } = await supabase.rpc("force_release_device", { p_device_id: d.id });
    if (error) {
      return setError(
        error.message.includes("limit reached")
          ? "You've used all 3 force-releases for this year. Email us and we'll sort it out."
          : error.message
      );
    }
    setNotice("Slot released. You can activate another Mac now.");
    loadLicense();
  }

  /* ------------------------------------------------------------------ render */

  const fade = reduced
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
      };

  if (phase === "loading") {
    return <div className="acct-skeleton" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading your account</span>
    </div>;
  }

  return (
    <div className="acct">
      <AnimatePresence mode="wait">

        {/* ---------------- signed out ---------------- */}
        {!session && (
          <motion.div key="signin" {...fade}>
            <h1>Sign in to continue</h1>
            <p className="lede acct-lede">
              You'll create an account before paying, so your licence is attached to an
              address you've confirmed. It's how we make sure a mistyped email can't cost you
              a purchase.
            </p>

            <div className="acct-card">
              <button className="btn btn-ghost btn-google" onClick={google} disabled={busy}>
                <GoogleGlyph /> Continue with Google
              </button>

              <div className="divider"><span>or</span></div>

              {phase === "email" ? (
                <form onSubmit={sendCode}>
                  <label htmlFor="acct-email">Email address</label>
                  <input
                    id="acct-email" type="email" inputMode="email" autoComplete="email"
                    required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" disabled={busy}
                  />
                  <p className="hint">We'll send a 6-digit code. No password to remember.</p>
                  <button className="btn btn-primary full" disabled={busy || !email.trim()}>
                    {busy ? "Sending…" : "Send code"}
                  </button>
                </form>
              ) : (
                <form onSubmit={verify}>
                  <label htmlFor="acct-code">Code sent to {email}</label>
                  <input
                    id="acct-code" type="text" inputMode="numeric" autoComplete="one-time-code"
                    required value={code} onChange={(e) => setCode(e.target.value)}
                    placeholder="123456" maxLength={6} disabled={busy}
                  />
                  <p className="hint">Check your spam folder if it hasn't arrived.</p>
                  <button className="btn btn-primary full" disabled={busy || !code.trim()}>
                    {busy ? "Checking…" : "Verify and continue"}
                  </button>
                  <div className="row-actions">
                    <button type="button" className="linkish"
                            onClick={() => { setPhase("email"); setCode(""); setError(null); }}>
                      Use a different email
                    </button>
                    <button type="button" className="linkish" disabled={cooldown > 0}
                            onClick={() => sendCode()}>
                      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}

        {/* ---------------- signed in ---------------- */}
        {session && (
          <motion.div key="account" {...fade}>
            <div className="acct-head">
              <div>
                <h1>Your account</h1>
                <p className="muted">{session.user.email}</p>
              </div>
              <button className="btn btn-ghost btn-sm"
                      onClick={() => supabase.auth.signOut()}>Sign out</button>
            </div>

            {loadingLicense && <div className="acct-skeleton" aria-busy="true" />}

            {!loadingLicense && !license && (
              <>
                <div className="acct-card">
                  <h2>Choose how many Macs</h2>
                  <p className="muted small" style={{ marginBottom: "var(--space-6)" }}>
                    One-time purchase. You can add more devices later without buying again.
                  </p>
                  <ul className="tierlist">
                    {TIERS.map(({ devices: n, inr, usd }) => {
                      const localised = prices[PRICE_IDS[n]];
                      return (
                        <li key={n}>
                          <button className="tierbtn" onClick={() => buy(n)}>
                            <span>{n} {n === 1 ? "Mac" : "Macs"}</span>
                            <span className="tierprice">
                              <strong>{localised ?? inr}</strong>
                              {/* The second currency is only useful before we know which one
                                  applies. Once we do, it is noise at best and misleading at
                                  worst. */}
                              {!localised && <span className="muted small">&nbsp;/&nbsp;{usd}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="hint" style={{ marginTop: "var(--space-4)" }}>
                    In India the price includes GST; elsewhere any local sales tax is added
                    at checkout. Checkout is handled by Paddle, and your licence will be
                    attached to <strong>{session.user.email}</strong>.
                  </p>
                </div>

                <p className="muted small" style={{ marginTop: "var(--space-6)" }}>
                  Already bought under a different email? <a href="mailto:om.chavan501@gmail.com">
                  Tell us</a> and we'll move the licence over.
                </p>
              </>
            )}

            {!loadingLicense && license && (
              <>
                <div className="acct-card">
                  <div className="lic-head">
                    <div>
                      <span className="pill">{license.kind}</span>
                      <h2>Up to {license.max_devices} {license.max_devices === 1 ? "Mac" : "Macs"}</h2>
                    </div>
                    <span className="slots">
                      {devices.filter(holdsSlot).length} of {license.max_devices} in use
                    </span>
                  </div>
                </div>

                <h2 className="sec-title">Your Macs</h2>
                {devices.length === 0 && (
                  <div className="acct-card empty">
                    <p className="muted">
                      No Macs activated yet. Install AksharaIME, open the Companion app and
                      click <strong>Activate this Mac</strong>.
                    </p>
                    <a className="btn btn-primary" href="/#install"
                       style={{ marginTop: "var(--space-4)" }}>Installation guide</a>
                  </div>
                )}

                <ul className="devlist">
                  {devices.map((d, i) => {
                    const active = holdsSlot(d);
                    const released = !!d.force_released_at;
                    const deact = !!d.deactivated_at;
                    return (
                      <motion.li
                        key={d.id}
                        className="dev"
                        initial={reduced ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <div className="dev-main">
                          <span className={`dot ${active ? "on" : "off"}`} aria-hidden="true" />
                          <div>
                            <strong>{d.name ?? "Unnamed Mac"}</strong>
                            <p className="muted small dev-state">
                              {released ? "Slot released"
                                : deact && active ? `Deactivated — stops when that Mac next connects. Undo works until then.`
                                : deact ? "Deactivated"
                                : active ? "Active" : "Lease expired"}
                              {d.last_checkin_at && ` · last seen ${relative(d.last_checkin_at)}`}
                            </p>
                          </div>
                        </div>
                        <div className="dev-actions">
                          {!deact && !released && (
                            <button className="btn btn-ghost btn-sm"
                                    onClick={() => deactivate(d)}>Deactivate</button>
                          )}
                          {/* Undo, not a confirm-before-deactivating: the action really is
                              reversible until that Mac connects, and confirmation prompts
                              only teach people to click through them. */}
                          {deact && !released && !d.revoked_confirmed_at && (
                            <button className="btn btn-ghost btn-sm"
                                    onClick={() => cancelDeactivation(d)}>Undo</button>
                          )}
                          {deact && active && !released && (
                            <button className="btn btn-sm danger-btn"
                                    onClick={() => forceRelease(d)}>Release slot now</button>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>

                {devices.some((d) => d.deactivated_at && holdsSlot(d)) && (
                  <p className="hint">
                    A deactivated Mac keeps its slot until it confirms it has stopped, or until
                    its lease expires — that's what prevents a licence being used on more Macs
                    than you bought. If a Mac is lost or dead and will never reconnect, release
                    its slot now.
                  </p>
                )}

                <div className="acct-card" style={{ marginTop: "var(--space-8)" }}>
                  <h2>Need more Macs?</h2>
                  <p className="muted small" style={{ marginBottom: "var(--space-4)" }}>
                    Buy a larger tier and we'll raise your existing licence rather than
                    creating a second one.
                  </p>
                  <div className="upgrade-row">
                    {TIERS.filter((t) => t.devices > license.max_devices).map((t) => (
                      <button key={t.devices} className="btn btn-ghost btn-sm"
                              onClick={() => buy(t.devices)}>
                        {t.devices} Macs · {t.inr}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feedback lives outside AnimatePresence so it isn't torn down mid-transition.
          aria-live announces it without stealing focus. */}
      <div aria-live="polite" className="feedback">
        {error && <p className="msg err" role="alert">{error}</p>}
        {notice && <p className="msg ok">{notice}</p>}
      </div>
    </div>
  );
}

function relative(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z"/>
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z"/>
      <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.5C3 17 2 20.4 2 24s1 7 2.5 9.9l7.3-5.7z"/>
      <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/>
    </svg>
  );
}
