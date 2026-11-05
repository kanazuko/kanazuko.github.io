import { createPublishHandler } from './handler.ts'

// Remains null until the owner authorizes a specific prepared draft.
// Activation requires a reviewed source change: ID, revision and account ID.
// No environment variable or request parameter enables publication.
Deno.serve(createPublishHandler(null))
