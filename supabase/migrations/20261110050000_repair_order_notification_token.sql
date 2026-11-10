-- Repair checkout on databases created before email notification tokens existed.
alter table public.orders
  add column if not exists email_notification_token uuid default gen_random_uuid();

update public.orders
set email_notification_token = gen_random_uuid()
where email_notification_token is null;

alter table public.orders
  alter column email_notification_token set not null;

create unique index if not exists orders_email_notification_token_idx
  on public.orders(email_notification_token);

notify pgrst, 'reload schema';
