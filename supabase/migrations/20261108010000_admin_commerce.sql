-- Montana Cadeaux: secure commerce and administrator foundations.
-- This migration only creates missing objects; it never drops customer or order data.
create extension if not exists pgcrypto;

do $$ begin create type public.app_role as enum ('customer', 'admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.discount_type as enum ('percentage', 'fixed'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', email text unique, phone text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'customer', created_at timestamptz not null default now()
);
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(), parent_id uuid references public.categories(id) on delete restrict,
  name text not null, slug text not null unique, description text, image_url text, display_order integer not null default 0,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), category_id uuid references public.categories(id) on delete restrict,
  name text not null, subtitle text, slug text not null unique, sku text unique, product_type text,
  short_description text, description text not null default '', specifications jsonb not null default '{}'::jsonb,
  regular_price numeric(12,2) not null check (regular_price >= 0), discount_price numeric(12,2) check (discount_price >= 0),
  discount_starts_at timestamptz, discount_ends_at timestamptz, stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_featured boolean not null default false, is_best_seller boolean not null default false, is_new_arrival boolean not null default false,
  is_active boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (discount_price is null or discount_price <= regular_price)
);
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null, image_url text not null, alt_text text, image_kind text not null default 'gallery', display_order integer not null default 0,
  created_at timestamptz not null default now(), unique(product_id, display_order)
);
create table if not exists public.product_colors (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  name text not null, hex_code text not null check (hex_code ~ '^#[0-9A-Fa-f]{6}$'), image_url text, storage_path text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0), is_active boolean not null default true,
  created_at timestamptz not null default now(), unique(product_id, name)
);
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  color_id uuid references public.product_colors(id) on delete set null, option_name text not null, option_value text not null,
  sku text unique, price_adjustment numeric(12,2) not null default 0, stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  is_active boolean not null default true, created_at timestamptz not null default now(), unique(product_id, option_name, option_value)
);
create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(), name text not null, discount_type public.discount_type not null, value numeric(12,2) not null check (value > 0),
  product_id uuid references public.products(id) on delete cascade, category_id uuid references public.categories(id) on delete cascade,
  starts_at timestamptz, ends_at timestamptz, is_active boolean not null default true, created_at timestamptz not null default now(),
  check ((product_id is not null)::integer + (category_id is not null)::integer = 1),
  check (discount_type <> 'percentage' or value <= 100)
);
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(), code text not null unique, discount_type public.discount_type not null,
  value numeric(12,2) not null check (value > 0), usage_limit integer, usage_count integer not null default 0,
  starts_at timestamptz, ends_at timestamptz, is_active boolean not null default true, created_at timestamptz not null default now(),
  check (usage_limit is null or usage_limit > 0), check (discount_type <> 'percentage' or value <= 100)
);
create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  full_address text not null, city text not null, phone text not null, is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null, order_number text not null unique,
  email_notification_token uuid not null default gen_random_uuid(),
  customer_name text not null, customer_email text, customer_phone text, delivery_address text not null, city text not null,
  subtotal numeric(12,2) not null check (subtotal >= 0), delivery_fee numeric(12,2) not null default 7 check (delivery_fee = 7),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0), total numeric(12,2) not null check (total >= 0),
  payment_method text not null default 'cod', payment_status text not null default 'pending', order_status public.order_status not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.orders add column if not exists email_notification_token uuid default gen_random_uuid();
update public.orders set email_notification_token = gen_random_uuid() where email_notification_token is null;
alter table public.orders alter column email_notification_token set not null;
create unique index if not exists orders_email_notification_token_idx on public.orders(email_notification_token);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null, color_id uuid references public.product_colors(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null, product_name text not null, product_image text,
  quantity integer not null check (quantity > 0), unit_price numeric(12,2) not null check (unit_price >= 0), subtotal numeric(12,2) not null check (subtotal >= 0), created_at timestamptz not null default now()
);
create table if not exists public.website_settings (
  id boolean primary key default true check (id), website_name text not null default 'MONTANA CADEAUX', logo_url text,
  contact_email text, phone text, instagram_url text, facebook_url text, currency text not null default 'DT' check (currency = 'DT'),
  delivery_fee numeric(12,2) not null default 7 check (delivery_fee = 7), announcement text, footer_content text, about_content text,
  updated_at timestamptz not null default now()
);
create table if not exists public.homepage_sections (
  id uuid primary key default gen_random_uuid(), section_key text not null unique, title text, subtitle text, body text,
  image_url text, button_text text, button_href text, display_order integer not null default 0, is_visible boolean not null default true,
  settings jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.inventory_logs (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  color_id uuid references public.product_colors(id) on delete set null, change_amount integer not null, reason text not null,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);

create index if not exists products_public_idx on public.products(category_id, is_active, created_at desc);
create index if not exists orders_admin_idx on public.orders(order_status, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists colors_product_idx on public.product_colors(product_id);
create unique index if not exists addresses_one_default_idx on public.addresses(user_id) where is_default;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin');
$$;
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
create or replace function public.log_product_stock() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stock_quantity is distinct from old.stock_quantity then
    insert into public.inventory_logs(product_id, change_amount, reason, created_by) values (new.id, new.stock_quantity - old.stock_quantity, 'manual adjustment', auth.uid());
  end if; return new;
end; $$;
drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists products_stock_log on public.products;
create trigger products_stock_log after update of stock_quantity on public.products for each row execute function public.log_product_stock();

alter table public.profiles enable row level security; alter table public.user_roles enable row level security;
alter table public.categories enable row level security; alter table public.products enable row level security;
alter table public.product_images enable row level security; alter table public.product_colors enable row level security;
alter table public.product_variants enable row level security; alter table public.discounts enable row level security;
alter table public.coupons enable row level security; alter table public.addresses enable row level security;
alter table public.orders enable row level security; alter table public.order_items enable row level security;
alter table public.website_settings enable row level security; alter table public.homepage_sections enable row level security;
alter table public.inventory_logs enable row level security;

drop policy if exists "public reads categories" on public.categories; create policy "public reads categories" on public.categories for select using (is_active or public.is_admin());
drop policy if exists "public reads products" on public.products; create policy "public reads products" on public.products for select using (is_active or public.is_admin());
drop policy if exists "public reads images" on public.product_images; create policy "public reads images" on public.product_images for select using (true);
drop policy if exists "public reads colors" on public.product_colors; create policy "public reads colors" on public.product_colors for select using (is_active or public.is_admin());
drop policy if exists "public reads variants" on public.product_variants; create policy "public reads variants" on public.product_variants for select using (is_active or public.is_admin());
drop policy if exists "customers read own profile" on public.profiles; create policy "customers read own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "customers update own profile" on public.profiles; create policy "customers update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "customers create own profile" on public.profiles; create policy "customers create own profile" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "customers manage own addresses" on public.addresses; create policy "customers manage own addresses" on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "customers read own orders" on public.orders; create policy "customers read own orders" on public.orders for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "customers create orders" on public.orders; create policy "customers create orders" on public.orders for insert with check (user_id is null or user_id = auth.uid());
drop policy if exists "customers read own order items" on public.order_items; create policy "customers read own order items" on public.order_items for select using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
drop policy if exists "customers create order items" on public.order_items; create policy "customers create order items" on public.order_items for insert with check (exists (select 1 from public.orders o where o.id = order_id and (o.user_id is null or o.user_id = auth.uid())));

create table if not exists public.order_email_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.order_email_notifications enable row level security;
drop policy if exists "customers read own email notifications" on public.order_email_notifications;
create policy "customers read own email notifications" on public.order_email_notifications
  for select using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

do $$ declare t text; begin
  foreach t in array array['categories','products','product_images','product_colors','product_variants','discounts','coupons','orders','order_items','website_settings','homepage_sections','inventory_logs','user_roles'] loop
    execute format('drop policy if exists "admins manage %s" on public.%I', t, t);
    execute format('create policy "admins manage %s" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

insert into storage.buckets (id, name, public) values ('product-images','product-images',true), ('homepage-images','homepage-images',true)
on conflict (id) do update set public = excluded.public;
drop policy if exists "public reads Montana storage" on storage.objects;
create policy "public reads Montana storage" on storage.objects for select using (bucket_id in ('product-images','homepage-images'));
drop policy if exists "admins manage Montana storage" on storage.objects;
create policy "admins manage Montana storage" on storage.objects for all using (bucket_id in ('product-images','homepage-images') and public.is_admin()) with check (bucket_id in ('product-images','homepage-images') and public.is_admin());

insert into public.website_settings (id) values (true) on conflict (id) do nothing;
-- Bootstrap exactly one administrator in Supabase SQL Editor after creating that Auth user:
-- insert into public.user_roles (user_id, role) values ('AUTH_USER_UUID', 'admin') on conflict (user_id) do update set role = 'admin';
