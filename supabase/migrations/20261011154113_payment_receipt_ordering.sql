-- A delayed payment_failed delivery must never erase a confirmed paid invoice.
create or replace function public.record_payment_receipt(
  p_invoice_id text, p_user_id uuid, p_subscription_id text, p_status text,
  p_amount_paid bigint, p_currency text, p_paid_at timestamptz, p_created_at timestamptz
) returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in ('paid','failed') or p_amount_paid < 0 or p_invoice_id is null
    or p_subscription_id is null or p_created_at is null or p_currency !~ '^[a-z]{3}$'
  then raise exception 'Invalid payment receipt'; end if;
  insert into public.payment_receipts as receipt
    (stripe_invoice_id,user_id,stripe_subscription_id,status,amount_paid,currency,paid_at,created_at)
  values(p_invoice_id,p_user_id,p_subscription_id,p_status,p_amount_paid,p_currency,p_paid_at,p_created_at)
  on conflict(stripe_invoice_id) do update set
    status=excluded.status,amount_paid=excluded.amount_paid,currency=excluded.currency,
    paid_at=excluded.paid_at,updated_at=now()
  where receipt.user_id=excluded.user_id and receipt.stripe_subscription_id=excluded.stripe_subscription_id
    and (receipt.status <> 'paid' or excluded.status='paid');
end $$;
revoke all on function public.record_payment_receipt(text,uuid,text,text,bigint,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.record_payment_receipt(text,uuid,text,text,bigint,text,timestamptz,timestamptz) to service_role;
