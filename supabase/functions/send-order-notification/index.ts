import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const adminEmail = 'gannounibilel383@gmail.com'
const adminDashboardUrl = `${Deno.env.get('PUBLIC_SITE_URL') || 'http://127.0.0.1:5173'}/admin`

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;')

const money = (value: unknown) => `${Number(value || 0).toFixed(2)} DT`
const tunisianDate = (value: string) => new Intl.DateTimeFormat('fr-TN', {
  timeZone: 'Africa/Tunis', dateStyle: 'long', timeStyle: 'short',
}).format(new Date(value))

const renderEmail = (order: Record<string, unknown>, items: Record<string, unknown>[]) => {
  const rows = items.map((item) => `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #eeeae2">
        <div style="display:flex;align-items:center;gap:14px">
          ${item.product_image ? `<img src="${escapeHtml(item.product_image)}" alt="" width="58" height="58" style="object-fit:cover;border-radius:2px">` : ''}
          <div><strong style="color:#222">${escapeHtml(item.product_name)}</strong><br>
          <span style="color:#777;font-size:12px">Quantity: ${escapeHtml(item.quantity)}</span></div>
        </div>
      </td>
      <td align="right" style="padding:16px 0;border-bottom:1px solid #eeeae2;color:#222">${money(item.subtotal)}</td>
    </tr>`).join('')

  return `<!doctype html><html><body style="margin:0;background:#faf9f6;color:#222;font-family:Arial,sans-serif">
  <div style="max-width:680px;margin:32px auto;background:#fff;border:1px solid #eeeae2">
    <div style="padding:28px 34px;border-bottom:3px solid #c6a15b">
      <div style="font-size:20px;letter-spacing:4px;font-weight:bold">MONTANA</div>
      <div style="font-size:10px;letter-spacing:6px;color:#c6a15b;margin-top:6px">CADEAUX</div>
    </div>
    <div style="padding:34px">
      <p style="font-size:11px;letter-spacing:2px;color:#c6a15b;font-weight:bold">NEW ORDER NOTIFICATION</p>
      <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:32px;margin:0 0 10px">A new order has arrived.</h1>
      <p style="color:#666;line-height:1.6">A customer has placed an order on Montana Cadeaux. Review the details below and prepare the delivery.</p>
      <a href="${escapeHtml(`${adminDashboardUrl}?order=${order.id}`)}" style="display:inline-block;background:#222;color:#fff;text-decoration:none;padding:14px 20px;font-size:11px;letter-spacing:1px;margin:14px 0 28px">VIEW ORDER IN ADMIN DASHBOARD</a>
      <h2 style="font-size:13px;letter-spacing:1px;border-bottom:1px solid #c6a15b;padding-bottom:10px">ORDER INFORMATION</h2>
      <p style="line-height:1.8"><strong>Order number:</strong> ${escapeHtml(order.order_number)}<br>
      <strong>Date and time:</strong> ${escapeHtml(tunisianDate(String(order.created_at)))} (Africa/Tunis)<br>
      <strong>Status:</strong> ${escapeHtml(order.order_status)}</p>
      <h2 style="font-size:13px;letter-spacing:1px;border-bottom:1px solid #c6a15b;padding-bottom:10px;margin-top:28px">CUSTOMER &amp; DELIVERY</h2>
      <p style="line-height:1.8"><strong>Name:</strong> ${escapeHtml(order.customer_name)}<br>
      <strong>Email:</strong> ${escapeHtml(order.customer_email || 'Not provided')}<br>
      <strong>Phone:</strong> ${escapeHtml(order.customer_phone)}<br>
      <strong>City:</strong> ${escapeHtml(order.city)}<br>
      <strong>Address:</strong> ${escapeHtml(order.delivery_address)}</p>
      <h2 style="font-size:13px;letter-spacing:1px;border-bottom:1px solid #c6a15b;padding-bottom:10px;margin-top:28px">ORDERED PRODUCTS</h2>
      <table width="100%" cellpadding="0" cellspacing="0"><tbody>${rows}</tbody></table>
      <div style="margin-top:22px;border-top:1px solid #222;padding-top:14px;line-height:2">
        <div>Products subtotal <span style="float:right">${money(order.subtotal)}</span></div>
        <div>Discounts <span style="float:right">-${money(order.discount_total)}</span></div>
        <div>Delivery fee <span style="float:right">${money(order.delivery_fee)}</span></div>
        <div style="font-size:20px;font-weight:bold;color:#c6a15b;margin-top:8px">TOTAL <span style="float:right">${money(order.total)}</span></div>
      </div>
      <p style="margin-top:26px;color:#777;font-size:12px">Payment method: ${escapeHtml(order.payment_method)} · Payment status: ${escapeHtml(order.payment_status)}</p>
    </div>
  </div></body></html>`
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { order_id: orderId, notification_token: token } = await request.json()
    if (!orderId || !token) return new Response(JSON.stringify({ error: 'order_id and notification_token are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!serviceKey || !supabaseUrl || !resendKey) throw new Error('Email notification secrets are not configured.')
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: order, error: orderError } = await admin.from('orders').select('*').eq('id', orderId).eq('email_notification_token', token).single()
    if (orderError || !order) return new Response(JSON.stringify({ error: 'Order not found.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: items, error: itemsError } = await admin.from('order_items').select('*').eq('order_id', orderId).order('created_at')
    if (itemsError) throw itemsError

    const { data: notification, error: notificationError } = await admin.from('order_email_notifications')
      .insert({ order_id: orderId, status: 'processing' }).select('id').single()
    if (notificationError?.code === '23505') return new Response(JSON.stringify({ ok: true, duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (notificationError || !notification) throw notificationError || new Error('Could not create notification record.')

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `montana-order-${orderId}` },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM_EMAIL') || 'Montana Cadeaux <onboarding@resend.dev>',
        to: [adminEmail],
        subject: `NEW ORDER RECEIVED — MONTANA CADEAUX — #${order.order_number}`,
        html: renderEmail(order, items || []),
      }),
    })
    const provider = await response.json()
    if (!response.ok) throw new Error(provider?.message || 'Email provider rejected the message.')
    await admin.from('order_email_notifications').update({ status: 'sent', provider_message_id: provider.id, sent_at: new Date().toISOString() }).eq('id', notification.id)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('send-order-notification failed', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Notification failed.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
