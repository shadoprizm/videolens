import type { Entitlement } from "./api/_lib/entitlements.js";

// The URL is a navigation hint. Only verified server entitlement proves access.
export function checkoutReady(entitlement: Entitlement | null): boolean {
  return Boolean(entitlement?.hasBillingSubscription && entitlement.plan === "pro"
    && ["active", "trialing"].includes(entitlement.subscriptionStatus));
}
