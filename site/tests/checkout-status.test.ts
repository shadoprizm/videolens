import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),get:vi.fn(),subscription:vi.fn(),items:vi.fn(),pro:vi.fn(),sync:vi.fn(),checkout:vi.fn(),entitlement:vi.fn()}));
vi.mock("../api/_lib/auth.js",()=>({authenticate:m.auth}));
vi.mock("../api/_lib/entitlements.js",()=>({getEntitlement:m.entitlement}));
vi.mock("../api/_lib/stripe.js",()=>({stripeClient:()=>({checkout:{sessions:{retrieve:m.get,listLineItems:m.items}},subscriptions:{retrieve:m.subscription}}),proItem:m.pro,syncSubscription:m.sync,syncCheckout:m.checkout,syncLatestInvoice:vi.fn()}));
import {handler} from "../api/checkout-status.js";
const req=()=>new Request("https://videolens.io/api/checkout-status?session=cs_fixture12345");
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID","price_vl");m.auth.mockResolvedValue({id:"u",source:"website"});m.get.mockResolvedValue({mode:"subscription",client_reference_id:"u",status:"complete",payment_status:"paid",subscription:{id:"sub_vl",metadata:{user_id:"u"}}});m.pro.mockReturnValue({price:{id:"price_vl"}});m.sync.mockResolvedValue("u");m.entitlement.mockResolvedValue({plan:"pro"});});
describe("checkout return reconciliation",()=>{
 it("confirms the authenticated member's actual Stripe session",async()=>{const result=await handler(req());expect(result.status).toBe(200);expect(await result.json()).toMatchObject({status:"complete",paymentStatus:"paid",entitlement:{plan:"pro"}});expect(m.checkout).toHaveBeenCalledWith(expect.objectContaining({client_reference_id:"u"}),"u");});
 it("rejects another member's session before any mutation",async()=>{m.get.mockResolvedValue({mode:"subscription",client_reference_id:"other"});expect((await handler(req())).status).toBe(404);expect(m.sync).not.toHaveBeenCalled();expect(m.checkout).not.toHaveBeenCalled();});
 it("rejects another product, even for the same customer",async()=>{m.pro.mockReturnValue(undefined);expect((await handler(req())).status).toBe(404);expect(m.sync).not.toHaveBeenCalled();});
 it("does not allow extension tokens to reconcile billing",async()=>{m.auth.mockResolvedValue({id:"u",source:"extension"});expect((await handler(req())).status).toBe(403);expect(m.get).not.toHaveBeenCalled();});
});
