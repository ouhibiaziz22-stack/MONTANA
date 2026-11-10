-- Allow customers to place cash-on-delivery orders without creating an account.
create or replace function public.place_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_governorate text,
  p_city text,
  p_delivery_address text,
  p_notes text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(12,2) := 0;
  v_item jsonb;
  v_product products%rowtype;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_item_total numeric(12,2);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ORDER_EMPTY';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) < 2
    or length(trim(coalesce(p_customer_phone, ''))) < 6
    or length(trim(coalesce(p_city, ''))) < 2
    or length(trim(coalesce(p_delivery_address, ''))) < 5 then
    raise exception 'INVALID_DELIVERY_DETAILS';
  end if;

  v_order_number := 'MC-' || to_char(now(), 'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.orders (
    user_id, order_number, customer_name, customer_email, customer_phone,
    governorate, delivery_address, city, notes, subtotal, delivery_fee, discount_total, total,
    payment_method, payment_status, order_status
  ) values (
    auth.uid(), v_order_number, trim(p_customer_name), nullif(lower(trim(coalesce(p_customer_email, ''))), ''),
    trim(p_customer_phone), trim(p_governorate), trim(p_delivery_address), trim(p_city), trim(coalesce(p_notes, '')),
    0, 7, 0, 7, 'cod', 'pending', 'pending'
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and is_active = true
      for update;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if v_product.stock_quantity < v_quantity then
      raise exception 'INSUFFICIENT_STOCK:%:%', v_product.name, v_product.stock_quantity;
    end if;
    v_unit_price := coalesce(v_product.discount_price, v_product.regular_price);
    v_item_total := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_item_total;
    insert into public.order_items (
      order_id, product_id, product_name, product_image, quantity, unit_price, subtotal
    ) values (
      v_order_id, v_product.id, v_product.name, v_item->>'product_image',
      v_quantity, v_unit_price, v_item_total
    );
    update public.products set stock_quantity = stock_quantity - v_quantity
      where id = v_product.id;
  end loop;

  update public.orders set subtotal = v_subtotal, total = v_subtotal + 7, updated_at = now()
    where id = v_order_id;
  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number, 'total', v_subtotal + 7);
exception
  when invalid_text_representation then raise exception 'INVALID_PRODUCT';
end;
$$;

revoke all on function public.place_order(text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.place_order(text, text, text, text, text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
