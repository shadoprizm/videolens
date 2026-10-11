import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
const m=vi.hoisted(()=>({upsert:vi.fn(),update:vi.fn(),activation:vi.fn(),retrieve:vi.fn(),invoice:vi.fn(),checkout:vi.fn(),authenticate:vi.fn(),entitlement:vi.fn()}));
vi.mock("../api/_lib/supabase.js",()=>({supabaseAdmin:()=>({from:(table:string)=>({upsert:(...args:unknown[])=>m.upsert(table,...args),update:(...args:unknown[])=>({eq:()=>m.update(table,...args)}),select:()=>({eq:()=>({maybeSingle:async()=>({data:{user_id:"u"},error:null})})})})})}));
vi.mock("../api/_lib/activation.js",()=>({recordActivation:m.activation}));
vi.mock("../api/_lib/auth.js",()=>({authenticate:m.authenticate}));
vi.mock("../api/_lib/entitlements.js",()=>({getEntitlement:m.entitlement}));
import {syncSubscription,syncInvoice,proItem} from "../api/_lib/stripe.js";
const subscription=(price="price_pro",status="active")=>({id:"sub_vl",customer:"cus_vl",metadata:{user_id:"u"},status,cancel_at_period_end:false,items:{data:[{price:{id:price,product:"prod_vl"},current_period_start:1,current_period_end:2}]}} as unknown as Stripe.Subscription);
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID","price_pro");vi.stubEnv("STRIPE_PRO_PRODUCT_ID","prod_vl");m.upsert.mockResolvedValue({error:null});m.update.mockResolvedValue({error:null});});
describe("product-bound billing ledger",()=>{
  it("ignores unrelated products before changing access or customer records",async()=>{expect(await syncSubscription(subscription("price_other"))).toBeNull();expect(m.upsert).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();expect(m.activation).not.toHaveBeenCalled();});
  it("accepts only configured prices when price IDs are present",()=>{expect(proItem(subscription("price_other"))).toBeUndefined();expect(proItem(subscription())).toBeDefined();});
  it("records access separately from payment and preserves canceled state",async()=>{expect(await syncSubscription(subscription())).toBe("u");expect(m.upsert).toHaveBeenCalledWith("subscriptions",expect.objectContaining({plan:"pro",status:"active"}),{onConflict:"user_id"});expect(m.upsert.mock.calls.some(c=>c[0]==="payment_receipts")).toBe(false);await syncSubscription(subscription("price_pro","canceled"));expect(m.upsert).toHaveBeenLastCalledWith("subscriptions",expect.objectContaining({status:"canceled"}),{onConflict:"user_id"});});
  it("stores the actual amount, including a zero-dollar trial invoice",async()=>{
    const invoice=(amount:number)=>({id:"in_vl",parent:{subscription_details:{subscription:subscription()}},status:"paid",amount_paid:amount,currency:"usd",created:1,status_transitions:{paid_at:2}} as unknown as Stripe.Invoice);
    await syncInvoice(invoice(0));expect(m.upsert).toHaveBeenLastCalledWith("payment_receipts",expect.objectContaining({amount_paid:0,status:"paid",stripe_invoice_id:"in_vl"}),{onConflict:"stripe_invoice_id"});
    await syncInvoice(invoice(1200));expect(m.upsert).toHaveBeenLastCalledWith("payment_receipts",expect.objectContaining({amount_paid:1200}),{onConflict:"stripe_invoice_id"});
  });
  it("does not write receipts for another product or standalone invoices",async()=>{await syncInvoice({parent:null} as Stripe.Invoice);await syncInvoice({parent:{subscription_details:{subscription:subscription("price_other")}}} as unknown as Stripe.Invoice);expect(m.upsert).not.toHaveBeenCalled();});
});
