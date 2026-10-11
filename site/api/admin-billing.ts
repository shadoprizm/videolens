import { requireAdministrator } from "./_lib/admin.js";
import { optionalEnv, requireEnv, siteUrl } from "./_lib/env.js";
import { ApiError, errorResponse, json, options, readJson } from "./_lib/http.js";
import { proItem, stripeClient, syncCheckout, syncInvoice, syncSubscription } from "./_lib/stripe.js";
import { supabaseAdmin } from "./_lib/supabase.js";

const REQUIRED_EVENTS = ["checkout.session.completed","checkout.session.expired","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed"] as const;
export async function handler(request:Request):Promise<Response> {
  const preflight=options(request);if(preflight) return preflight;
  if(request.method!=="POST") return json(request,{error:"method_not_allowed"},405);
  try {
    await requireAdministrator(request);
    const body=await readJson<{action?:string}>(request,1000);
    if(!["audit","reconcile"].includes(body.action || "")) throw new ApiError(400,"invalid_action","Choose audit or reconciliation.");
    const reconcile=body.action==="reconcile";
    const stripe=stripeClient();
    const priceIds=[requireEnv("STRIPE_PRO_MONTHLY_PRICE_ID"),requireEnv("STRIPE_PRO_ANNUAL_PRICE_ID")];
    const prices=await Promise.all(priceIds.map(id=>stripe.prices.retrieve(id)));
    const product=optionalEnv("STRIPE_PRO_PRODUCT_ID");
    const configurationValid=prices.every((price,index)=>price.active && price.currency==="usd" && price.unit_amount===(index===0?1200:9900) && price.recurring?.interval===(index===0?"month":"year") && price.recurring.interval_count===1 && (!product || (typeof price.product==="string"?price.product:price.product.id)===product));
    if(!configurationValid) throw new ApiError(409,"billing_configuration_mismatch","Configured Pro prices do not match the expected product, currency or billing intervals.");
    const {data:profiles,error}=await supabaseAdmin().from("profiles").select("user_id,stripe_customer_id");if(error) throw error;
    const members=new Set((profiles || []).map(p=>p.user_id));
    const sessions=[];
    let startingAfter:string|undefined;
    let complete=true;
    for(let page=0;page<3;page++) {
      const batch=await stripe.checkout.sessions.list({created:{gte:Math.floor(Date.now()/1000)-30*86400},limit:100,...(startingAfter?{starting_after:startingAfter}:{})});
      for(const session of batch.data) {
        const userId=session.client_reference_id || session.metadata?.user_id;
        if(session.mode!=="subscription" || !userId || !members.has(userId)) continue;
        const subscription=session.subscription ? typeof session.subscription==="string"?await stripe.subscriptions.retrieve(session.subscription):session.subscription : null;
        if(subscription ? !proItem(subscription) || (subscription.metadata.user_id && subscription.metadata.user_id!==userId) : !(await stripe.checkout.sessions.listLineItems(session.id)).data.some(item=>item.price && priceIds.includes(item.price.id))) continue;
        sessions.push({memberId:userId,status:session.status,paymentStatus:session.payment_status,createdAt:new Date(session.created*1000).toISOString()});
        if(reconcile) {
          await syncCheckout(session,userId);
          if(subscription) {
            await syncSubscription(subscription);
            const invoices=await stripe.invoices.list({subscription:subscription.id,limit:100});
            for(const invoice of invoices.data) if(invoice.status==="paid" || invoice.attempted && invoice.status==="open") await syncInvoice(invoice);
          }
        }
      }
      if(!batch.has_more) break;
      startingAfter=batch.data.at(-1)?.id;
      if(page===2) complete=false;
    }
    const endpoints=await stripe.webhookEndpoints.list({limit:100});
    const expectedUrl=`${siteUrl()}/api/stripe-webhook`;
    const endpoint=endpoints.data.find(e=>e.url===expectedUrl && e.status==="enabled");
    const missing=endpoint && !endpoint.enabled_events.includes("*") ? REQUIRED_EVENTS.filter(e=>!endpoint.enabled_events.includes(e)) : [];
    if(reconcile && endpoint && missing.length) await stripe.webhookEndpoints.update(endpoint.id,{enabled_events:[...new Set([...endpoint.enabled_events,...REQUIRED_EVENTS])]});
    return json(request,{reconciled:reconcile,complete,windowDays:30,liveMode:prices[0].livemode,prices:prices.map(p=>({amount:p.unit_amount,currency:p.currency,interval:p.recurring?.interval})),sessions,webhook:{found:Boolean(endpoint),missingEvents:reconcile && endpoint?[]:missing,updated:Boolean(reconcile && endpoint && missing.length)},checkedAt:new Date().toISOString()});
  } catch(error) {return errorResponse(request,error);}
}
export default {fetch:handler};
