import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function stateSigningKey(encryptionKey: Buffer) {
  return createHash('sha256').update('aura-outlook-oauth-state-key-v1:').update(encryptionKey).digest();
}

export function createOAuthState(userId: string, key: Buffer) {
  const state = randomBytes(32).toString('base64url');
  const signature = createHmac('sha256', stateSigningKey(key)).update(`${state}.${userId}`).digest('base64url');
  return { state, cookie: `${state}.${userId}.${signature}` };
}

export function validateOAuthState(cookie: string, supplied: string, currentUserId: string, key: Buffer) {
  const [saved, ownerId, signature, extra] = cookie.split('.');
  if (!saved || !ownerId || !signature || extra || ownerId !== currentUserId) return false;
  const expectedSignature = createHmac('sha256', stateSigningKey(key)).update(`${saved}.${ownerId}`).digest();
  const receivedSignature = Buffer.from(signature, 'base64url');
  const a = Buffer.from(saved), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b) && receivedSignature.length === expectedSignature.length && timingSafeEqual(receivedSignature, expectedSignature);
}
