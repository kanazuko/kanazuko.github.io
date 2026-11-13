export function normalizeInstagramPostUrl(value) {
  let url
  try { url = new URL(value.trim()) } catch { throw new Error('Pega un enlace válido de una publicación de Instagram.') }
  if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.port || url.username || url.password || !/^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
    throw new Error('Usa un enlace https://www.instagram.com/p/… o /reel/… de la publicación.')
  }
  return `https://www.instagram.com${url.pathname.replace(/\/$/, '')}/`
}
