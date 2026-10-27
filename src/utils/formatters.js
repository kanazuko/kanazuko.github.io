export function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(value)
}

export function titleFromSlug(slug = '') {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function toTitleCase(value = '') {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-MX')
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, separator, letter) => `${separator}${letter.toLocaleUpperCase('es-MX')}`)
}

const availabilityLabels = {
  available: 'Disponible',
  out_of_stock: 'Agotado',
  made_to_order: 'Sobre pedido',
}

export function formatAvailability(value) {
  return availabilityLabels[value] ?? value
}

export function formatAttributeName(value = '') {
  return titleFromSlug(value.replaceAll('_', '-'))
}

export function slugify(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
