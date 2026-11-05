import jpeg from 'npm:jpeg-js@0.4.4'

export function normalizeJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error('INVALID_JPEG')
  const image = jpeg.decode(bytes, { useTArray: true, tolerantDecoding: false, maxResolutionInMP: 2, maxMemoryUsageInMB: 32 })
  if (image.width !== 1080 || image.height !== 1080) throw new Error('INVALID_DIMENSIONS')
  // Pixel-only re-encoding strips EXIF, comments, foreign profiles and trailing payloads.
  return new Uint8Array(jpeg.encode({ width: image.width, height: image.height, data: image.data }, 90).data)
}
