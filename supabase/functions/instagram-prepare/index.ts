import { normalizeJpeg } from './jpeg.ts'
import { createPrepareHandler } from './handler.ts'

Deno.serve(createPrepareHandler(normalizeJpeg))
