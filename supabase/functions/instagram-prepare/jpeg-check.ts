// Run explicitly with Deno; keep this out of Node's automatic test discovery.
import jpeg from 'npm:jpeg-js@0.4.4'
import { normalizeJpeg } from './jpeg.ts'

Deno.test('decodes/re-encodes actual JPEG pixels; rejects wrong sizes, fake images and excessive resolution', () => {
  const make = (width: number, height: number) => new Uint8Array(jpeg.encode({ width, height, data: new Uint8Array(width * height * 4).fill(255) }, 85).data)
  const bytes = normalizeJpeg(make(1080, 1080))
  const decoded = jpeg.decode(bytes, { useTArray: true })
  if (decoded.width !== 1080 || decoded.height !== 1080 || bytes.length > 8388608) throw new Error('Invalid normalized JPEG')
  for (const input of [new Uint8Array([255, 216, 255, 217]), new TextEncoder().encode('<svg/>'), make(10, 10), make(1500, 1500)]) {
    let rejected = false
    try { normalizeJpeg(input) } catch { rejected = true }
    if (!rejected) throw new Error('Invalid image was accepted')
  }
})
