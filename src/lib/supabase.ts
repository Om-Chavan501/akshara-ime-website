import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client.
 *
 * The publishable ("anon") key is safe to ship — it identifies the project and grants
 * nothing on its own. Every real permission is enforced server-side by RLS and the
 * security-definer functions; see backend/README.md in the product repo.
 */
export const SUPABASE_URL = "https://vsckavugkyeoanbygpqt.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzY2thdnVna3llb2FuYnlncHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NjI2MDgsImV4cCI6MjEwMDUzODYwOH0.KY0LBXyfwfR-averiCtMGsOXXfWCA3UFSm4kaOu82r8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const PADDLE_CLIENT_TOKEN = "live_bc9d2798aef85e4af5742df30e9";

/** Device-tier price IDs, live Paddle catalogue. custom_data.max_devices drives the licence. */
export const PRICE_IDS: Record<number, string> = {
  1: "pri_01kycxftj624snq4t04tq6ck3c",
  2: "pri_01kycxftydgj1bytm48tag0f0v",
  3: "pri_01kycxfv7n7wvh92nt0r788z15",
  4: "pri_01kycxfvgt6b4jnjx0gp8s7y5v",
  5: "pri_01kycxfvx5c3jrs3dbezg9f3be",
};

/**
 * The price ladder, as a *fallback only*.
 *
 * Paddle is the source of truth: the prices are USD-based with an India-only INR override, so
 * what a visitor pays depends on where they are. These figures are what renders before the
 * localised prices arrive (and if they never do), which is why they exist at all — a pricing
 * table that is blank without JavaScript is not an improvement on one that is slightly stale.
 *
 * They were stale, and that is the hazard worth naming: this list said $17.99 for a while
 * after Paddle had been raised to $29, so the page advertised one number and the checkout
 * charged another. Anything hardcoded here must be re-checked against Paddle when prices
 * move — `backend/supabase/functions/price-preview` is what makes the live page correct
 * regardless.
 */
export const TIERS = [
  { devices: 1, inr: "₹1,499", usd: "$29" },
  { devices: 2, inr: "₹2,499", usd: "$49" },
  { devices: 3, inr: "₹3,499", usd: "$69" },
  { devices: 4, inr: "₹4,499", usd: "$89" },
  { devices: 5, inr: "₹5,499", usd: "$109" },
];

export interface License {
  id: string;
  max_devices: number;
  kind: string;
  status: string;
  expires_at: string | null;
}

export interface Device {
  id: string;
  license_id: string;
  name: string | null;
  lease_expires_at: string | null;
  deactivated_at: string | null;
  force_released_at: string | null;
  revoked_confirmed_at: string | null;
  last_checkin_at: string | null;
}

/**
 * Whether a device still occupies a licence slot.
 *
 * Mirrors device_holds_slot() in the database exactly. Showing a deactivated device as
 * "free" when the server still counts it would mislead someone during precisely the
 * conversation where they need the truth — "why can't I activate my other Mac?".
 */
export function holdsSlot(d: Device): boolean {
  return (
    !!d.lease_expires_at &&
    new Date(d.lease_expires_at) > new Date() &&
    !d.revoked_confirmed_at &&
    !d.force_released_at
  );
}
