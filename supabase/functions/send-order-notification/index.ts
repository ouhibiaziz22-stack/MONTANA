import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const adminEmail = 'gannounibilel383@gmail.com'

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;')

const renderEmail = (order: Record<string, unknown>, items: Record<string, unknown>[], recipient: 'admin' | 'customer') => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:20px auto;color:#222">
    <h1 style="border-bottom:3px solid #c6a15b;padding-bottom:18px">MONTANA CADEAUX</h1>
    <p>${recipient === 'admin' ? 'A new order has arrived.' : 'Thank you for your order.'}</p>
    <p><strong>Order number:</strong> ${escapeHtml(order.order_number)}<br>
    <strong>Status:</strong> ${escapeHtml(order.order_status)}<br>
    <strong>Customer:</strong> ${escapeHtml(order.customer_name)}<br>
    <strong>Phone:</strong> ${escapeHtml(order.customer_phone)}<br>
    <strong>Delivery:</strong> ${escapeHtml(order.governorate)}, ${escapeHtml(order.city)} — ${escapeHtml(order.delivery_address)}</p>
    <table width="100%" cellpadding="8" cellspacing="0"><tbody>
      ${items.map((item) => `<tr><td style="border-bottom:1px solid #eee">${escapeHtml(item.product_name)} × ${escapeHtml(item.quantity)}</td><td align="right" style="border-bottom:1px solid #eee">${Number(item.subtotal || 0).toFixed(2)} DT</td></tr>`).join('')}
    </tbody></table>
    <p style="font-size:20px;color:#a8864b"><strong>Total: ${Number(order.total || 0).toFixed(2)} DT</strong></p>
  </div>`

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { order_id: orderId, notification_token: token } = await request.json()
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!orderId || !token || !serviceKey || !supabaseUrl || !resendKey) throw new Error('Notification configuration is incomplete.')
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: order, error: orderError } = await admin.from('orders').select('*').eq('id', orderId).eq('email_notification_token', token).single()
    if (orderError || !order) return new Response(JSON.stringify({ error: 'Order not found.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: items, error: itemsError } = await admin.from('order_items').select('*').eq('order_id', orderId).order('created_at')
    if (itemsError) throw itemsError
    const { data: notification, error: notificationError } = await admin.from('order_email_notifications').insert({ order_id: orderId, status: 'processing' }).select('id').single()
    if (notificationError?.code === '23505') return new Response(JSON.stringify({ ok: true, duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (notificationError || !notification) throw notificationError || new Error('Could not create notification record.')
    const recipients: { to: string; kind: 'admin' | 'customer'; subject: string }[] = [{ to: adminEmail, kind: 'admin', subject: `NEW ORDER — #${order.order_number}` }]
    if (order.customer_email) recipients.push({ to: order.customer_email, kind: 'customer' as const, subject: `Order confirmation — #${order.order_number}` })
    for (const recipient of recipients) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `montana-order-${orderId}-${recipient.kind}` },
        body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL') || 'Montana Cadeaux <onboarding@resend.dev>', to: [recipient.to], subject: recipient.subject, html: renderEmail(order, items || [], recipient.kind) }),
      })
      if (!response.ok) throw new Error((await response.json()).message || 'Email provider rejected the message.')
    }
    await admin.from('order_email_notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', notification.id)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('send-order-notification failed', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Notification failed.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
