const base64 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
export const publicTestKey = 'sb_publishable_fake_public_key'
// Deliberately unsigned fixture; never sent to any real endpoint.
export const sessionJwt = (claims = {}) => `${base64({ alg: 'HS256', typ: 'JWT' })}.${base64({ role: 'authenticated', sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exp: Math.floor(Date.now()/1000)+3600, iss: 'https://blsezjyhiholzwmqewef.supabase.co/auth/v1', ...claims })}.ZmFrZS1zaWduYXR1cmU`
