export function orderEmail(order) {
  const money = (amount) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount)
  const lines = [...order.order_items].sort((a, b) => a.id.localeCompare(b.id)).map((item) => {
    const details = [item.material, item.color, item.size].filter(Boolean).join(' / ')
    return `${item.quantity} × ${item.product_name}${details ? ` (${details})` : ''} — ${money(item.unit_price)} por pieza`
  })
  return {
    to: [order.email],
    subject: `Recibimos tu pedido #${order.order_number} · PRArtJewelry`,
    text: [
      `Hola, ${order.customer_name}.`,
      `Recibimos tu pedido #${order.order_number}:`,
      '', ...lines, '',
      `Total de productos: ${money(order.total)}`,
      `Dirección aproximada: ${order.delivery_address}`,
      '',
      'Nos pondremos en contacto contigo para confirmar disponibilidad, compra y entrega. Cualquier costo de entrega se acordará contigo.',
      'No se ha realizado ningún cobro en línea.',
      'Gracias por elegir PRArtJewelry.',
    ].join('\n'),
  }
}
