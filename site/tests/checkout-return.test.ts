import { expect, it } from "vitest";
import { checkoutReady } from "../checkout-return.js";
import type { Entitlement } from "../api/_lib/entitlements.js";
it.each([
  [null, false],
  [{ plan: "free", hasBillingSubscription: false, subscriptionStatus: "none" }, false],
  [{ plan: "pro", hasBillingSubscription: false, subscriptionStatus: "active" }, false],
  [{ plan: "pro", hasBillingSubscription: true, subscriptionStatus: "incomplete" }, false],
  [{ plan: "pro", hasBillingSubscription: true, subscriptionStatus: "active" }, true],
  [{ plan: "pro", hasBillingSubscription: true, subscriptionStatus: "trialing" }, true],
])("confirms checkout from server billing entitlement only: %j", (entitlement, ready) => {
  expect(checkoutReady(entitlement as Entitlement | null)).toBe(ready);
});
