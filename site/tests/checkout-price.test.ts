import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({retrieve:vi.fn(),invoice:vi.fn()}));
vi.mock("stripe",()=>({default:class {prices={retrieve:m.retrieve};invoices={retrieve:m.invoice};}}));
import {verifiedProPrice,syncLatestInvoice} from "../api/_lib/stripe.js";
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("STRIPE_SECRET_KEY","test_fixture");vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID","price_month");vi.stubEnv("STRIPE_PRO_PRODUCT_ID","prod_vl");});
describe("restricted billing credentials",()=>{
 it("keeps configured checkout usable when the existing key lacks Prices Read",async()=>{m.retrieve.mockRejectedValue({type:"StripePermissionError"});expect(await verifiedProPrice("monthly")).toBe("price_month");});
 it("does not bypass an actual price mismatch",async()=>{m.retrieve.mockResolvedValue({active:true,currency:"cad",unit_amount:1200,recurring:{interval:"month",interval_count:1},product:"prod_vl"});await expect(verifiedProPrice("monthly")).rejects.toMatchObject({code:"billing_configuration_mismatch"});});
 it("propagates network and other Stripe failures",async()=>{m.retrieve.mockRejectedValue(new Error("network"));await expect(verifiedProPrice("monthly")).rejects.toThrow("network");});
 it("does not block checkout confirmation when historical invoice reads are denied",async()=>{m.invoice.mockRejectedValue({type:"StripePermissionError"});await expect(syncLatestInvoice({latest_invoice:"in_fixture"} as never)).resolves.toBeUndefined();});
});
