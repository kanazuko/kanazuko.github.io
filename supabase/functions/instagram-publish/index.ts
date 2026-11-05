import { createPublishHandler } from './handler.ts'

// Owner-authorized production publishing for @prartjewelry.
// Every prepared draft requires administrator authentication and exact-content confirmation.
Deno.serve(createPublishHandler({ account_id: '17841465479111585' }))
