import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * The header's account control.
 *
 * Signed out it says "Sign in", not "Get AksharaIME" — because under auth-before-purchase
 * those are the same destination, and labelling it as a purchase makes signing in to manage
 * an existing licence feel like being sold to again.
 *
 * Renders a fixed-width placeholder until the session resolves, so the header doesn't shift
 * as it loads.
 *
 * Its CSS lives in THIS file, not SiteHeader.astro. It used to be the other way round — the
 * .nav-acct/.nav-avatar rules were written into SiteHeader's scoped <style> block — and they
 * silently never applied: Astro's scoped-style mechanism tags elements written directly in
 * the .astro template at build time, but this component's markup doesn't exist yet at that
 * point. It's created by React in the browser after hydration, so the scoped selectors never
 * matched it. The visible symptom was "Account" rendering as a plain underlined link with no
 * avatar chip — the browser default link style, since nothing else applied. Every other
 * framework island in this project (TryIt, HeroDemo) already keeps its styles inline for
 * exactly this reason; this one just hadn't followed the pattern.
 *
 * The <style> tag is rendered once in a wrapping fragment rather than nested inside the <a>
 * or duplicated per branch — a <style> element isn't valid inside an <a>, and every render
 * path (loading placeholder, signed-out, signed-in) needs the rules to be present.
 */
export default function NavAccount() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setEmail(s?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const styles = (
    <style>{`
      .nav-acct {
        display: inline-flex; align-items: center; gap: var(--space-2);
        text-decoration: none; color: var(--text); font-size: var(--text-sm);
        padding: var(--space-2) var(--space-3) var(--space-2) var(--space-2);
        border: 1px solid var(--border); border-radius: var(--radius-full);
        min-height: 38px;
      }
      .nav-acct:hover { border-color: var(--accent); color: var(--text); }
      .nav-avatar {
        width: 24px; height: 24px; border-radius: 50%;
        background: var(--accent); color: var(--text-on-accent);
        display: grid; place-items: center; font-size: 11px; font-weight: 700;
        flex: none;
      }
      .nav-acct-ph { display: inline-block; width: 104px; height: 38px; }
    `}</style>
  );

  if (!ready) return <>{styles}<span className="nav-acct-ph" aria-hidden="true" /></>;

  if (!email) {
    return <>{styles}<a className="btn btn-primary btn-sm" href="/account.html">Sign in</a></>;
  }

  return (
    <>
      {styles}
      <a className="nav-acct" href="/account.html" title={email}>
        <span className="nav-avatar" aria-hidden="true">{email[0]?.toUpperCase()}</span>
        <span className="nav-acct-label">Account</span>
      </a>
    </>
  );
}
