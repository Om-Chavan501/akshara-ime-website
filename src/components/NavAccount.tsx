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

  if (!ready) return <span className="nav-acct-ph" aria-hidden="true" />;

  if (!email) {
    return <a className="btn btn-primary btn-sm" href="/account.html">Sign in</a>;
  }

  return (
    <a className="nav-acct" href="/account.html" title={email}>
      <span className="nav-avatar" aria-hidden="true">{email[0]?.toUpperCase()}</span>
      <span className="nav-acct-label">Account</span>
    </a>
  );
}
