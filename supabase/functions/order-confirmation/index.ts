import { orderEmail } from './email.js'

// Optional database webhook. Never called with a public browser credential.
Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const webhookSecret = Deno.env.get('ORDER_EMAIL_WEBHOOK_SECRET')
  if (!webhookSecret || request.headers.get('x-order-webhook-secret') !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 })
  }
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('ORDER_EMAIL_FROM')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !from || !supabaseUrl || !serviceKey) return new Response('Email is not configured', { status: 503 })

  try {
    const event = await request.json()
    if (event.type !== 'INSERT' || event.table !== 'orders' || event.schema !== 'public'
      || typeof event.record?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(event.record.id)) {
      return new Response('Invalid event', { status: 400 })
    }
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
    const endpoint = `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(event.record.id)}`
    // Read committed data: the INSERT event precedes the final total and items in the transaction.
    // Only the persisted email address and product snapshots may be used.
    const result = await fetch(`${endpoint}&select=id,order_number,customer_name,email,delivery_address,total,email_sent_at,order_items(id,product_name,material,color,size,unit_price,quantity)`, { headers, signal: AbortSignal.timeout(10000) })
    if (!result.ok) return new Response('Order lookup failed', { status: 502 })
    const [order] = await result.json()
    if (!order) return new Response('Order not found', { status: 404 })
    if (order.email_sent_at) return new Response('Already sent')
    if (!order.order_items?.length) return new Response('Order has no items', { status: 409 })
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `order-confirmation/${order.id}` },
      body: JSON.stringify({ from, ...orderEmail(order) }),
      signal: AbortSignal.timeout(15000),
    })
    if (!sent.ok) return new Response('Email provider rejected the request', { status: 502 })
    const updated = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify({ email_sent_at: new Date().toISOString() }), signal: AbortSignal.timeout(10000) })
    if (!updated.ok) return new Response('Email accepted but status update failed', { status: 502 })
    return new Response('Sent')
  } catch {
    return new Response('Unable to process email', { status: 500 })
  }
})
