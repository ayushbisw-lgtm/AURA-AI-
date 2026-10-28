import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getOutlookConfig } from './config.ts';

export function encryptTokenCache(value: string, ownerId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getOutlookConfig().encryptionKey, iv);
  cipher.setAAD(Buffer.from(`aura-outlook-cache:${ownerId}`));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptTokenCache(value: string, ownerId: string) {
  const [iv, tag, encrypted, extra] = value.split('.');
  if (!iv || !tag || !encrypted || extra) throw new Error('Saved Outlook credentials are invalid. Reconnect Outlook.');
  const decipher = createDecipheriv('aes-256-gcm', getOutlookConfig().encryptionKey, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(`aura-outlook-cache:${ownerId}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
