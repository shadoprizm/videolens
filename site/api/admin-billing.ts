import { requireAdministrator } from "./_lib/admin.js";
import { optionalEnv, requireEnv, siteUrl } from "./_lib/env.js";
import { ApiError, errorResponse, json, options, readJson } from "./_lib/http.js";
import { proItem, stripeClient, stripePermissionDenied, syncCheckout, syncInvoice, syncSubscription } from "./_lib/stripe.js";
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
    const permissions=new Set<string>();
    async function read<T>(permission:string,operation:()=>Promise<T>):Promise<T|null> {
      try {return await operation();} catch(error) {if(!stripePermissionDenied(error)) throw error;permissions.add(permission);return null;}
    }
    const prices=await read("Prices: Read",()=>Promise.all(priceIds.map(id=>stripe.prices.retrieve(id))));
    const product=optionalEnv("STRIPE_PRO_PRODUCT_ID");
    const configurationValid=prices===null ? null : prices.every((price,index)=>price.active && price.currency==="usd" && price.unit_amount===(index===0?1200:9900) && price.recurring?.interval===(index===0?"month":"year") && price.recurring.interval_count===1 && (!product || (typeof price.product==="string"?price.product:price.product.id)===product));
    if(configurationValid===false) throw new ApiError(409,"billing_configuration_mismatch","Configured Pro prices do not match the expected product, currency or billing intervals.");
    const {data:profiles,error}=await supabaseAdmin().from("profiles").select("user_id,stripe_customer_id");if(error) throw error;
    const members=new Set((profiles || []).map(p=>p.user_id));
    const linkedCustomer=profiles?.find(profile=>profile.stripe_customer_id)?.stripe_customer_id;
    // An unpaid cohort may have no subscription to retrieve. Probe the permissions
    // with one existing VideoLens customer without retaining any returned records.
    const subscriptionRead=linkedCustomer ? await read("Subscriptions: Read",async()=>{await stripe.subscriptions.list({customer:linkedCustomer,limit:1});return true;}) : null;
    const invoiceRead=linkedCustomer ? await read("Invoices: Read",async()=>{await stripe.invoices.list({customer:linkedCustomer,limit:1});return true;}) : null;
    const sessions=[];
    let startingAfter:string|undefined;
    let complete=true;
    for(let page=0;page<3;page++) {
      const batch=await read("Checkout Sessions: Read",()=>stripe.checkout.sessions.list({created:{gte:Math.floor(Date.now()/1000)-30*86400},limit:100,...(startingAfter?{starting_after:startingAfter}:{})}));
      if(!batch) {complete=false;break;}
      for(const session of batch.data) {
        const userId=session.client_reference_id || session.metadata?.user_id;
        if(session.mode!=="subscription" || !userId || !members.has(userId)) continue;
        const subscription=session.subscription ? typeof session.subscription==="string"?await read("Subscriptions: Read",()=>stripe.subscriptions.retrieve(session.subscription as string)):session.subscription : null;
        if(session.subscription && !subscription) {complete=false;continue;}
        const items=subscription ? null : await read("Checkout Sessions: Read",()=>stripe.checkout.sessions.listLineItems(session.id));
        if(!subscription && !items) {complete=false;continue;}
        if(subscription ? !proItem(subscription) || (subscription.metadata.user_id && subscription.metadata.user_id!==userId) : !items?.data.some(item=>item.price && priceIds.includes(item.price.id))) continue;
        sessions.push({memberId:userId,status:session.status,paymentStatus:session.payment_status,createdAt:new Date(session.created*1000).toISOString()});
        if(reconcile) {
          await syncCheckout(session,userId);
          if(subscription) {
            await syncSubscription(subscription);
          }
        }
        if(subscription) {
          const invoices=await read("Invoices: Read",()=>stripe.invoices.list({subscription:subscription.id,limit:100}));
          if(!invoices || invoices.has_more) complete=false;
          if(reconcile && invoices) for(const invoice of invoices.data) if(invoice.status==="paid" || invoice.attempted && invoice.status==="open") await syncInvoice(invoice);
        }
      }
      if(!batch.has_more) break;
      startingAfter=batch.data.at(-1)?.id;
      if(page===2) complete=false;
    }
    const endpoints=await read("Webhook Endpoints: Read",()=>stripe.webhookEndpoints.list({limit:100}));
    const expectedUrl=`${siteUrl()}/api/stripe-webhook`;
    const endpoint=endpoints?.data.find(e=>e.url===expectedUrl && e.status==="enabled");
    const missing=endpoint && !endpoint.enabled_events.includes("*") ? REQUIRED_EVENTS.filter(e=>!endpoint.enabled_events.includes(e)) : [];
    const updated=reconcile && endpoint && missing.length ? Boolean(await read("Webhook Endpoints: Write",()=>stripe.webhookEndpoints.update(endpoint.id,{enabled_events:[...new Set([...endpoint.enabled_events,...REQUIRED_EVENTS])]}))) : false;
    if(!endpoints || endpoints.has_more) complete=false;
    return json(request,{reconciled:reconcile,complete:complete && permissions.size===0,permissionsNeeded:[...permissions],permissionChecks:{customerScoped:Boolean(linkedCustomer),subscriptions:subscriptionRead===true,invoices:invoiceRead===true},configurationVerified:configurationValid===true,windowDays:30,liveMode:prices?.[0].livemode ?? null,prices:prices?.map(p=>({amount:p.unit_amount,currency:p.currency,interval:p.recurring?.interval})) ?? [],sessions,webhook:{checked:Boolean(endpoints),found:Boolean(endpoint),missingEvents:updated?[]:missing,updated},checkedAt:new Date().toISOString()});
  } catch(error) {return errorResponse(request,error);}
}
export default {fetch:handler};
