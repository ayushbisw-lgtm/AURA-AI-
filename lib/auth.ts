import { createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from './supabase/server';
import { hasSupabaseConfig, SupabaseSetupError } from './supabase/config';

const scrypt = promisify(nodeScrypt);
const DATA_DIR = path.join(process.cwd(), '.aura-data');
const USERS_FILE = path.join(DATA_DIR, 'accounts.json');
const SECRET_FILE = path.join(DATA_DIR, 'session.key');
export const SESSION_COOKIE = 'aura_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export type PublicUser = { id: string; name: string; email: string };
type StoredUser = PublicUser & { salt: string; passwordHash: string; createdAt: string };
let accountWriteQueue: Promise<void> = Promise.resolve();

function getSupabaseProfileName(metadata: Record<string, unknown> | undefined): string {
  for (const key of ['name', 'full_name', 'user_name']) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  }
  return '';
}

async function ensureDataDir() { await mkdir(DATA_DIR, { recursive: true, mode: 0o700 }); }

async function readUsers(): Promise<StoredUser[]> {
  await ensureDataDir();
  try {
    const data: unknown = JSON.parse(await readFile(USERS_FILE, 'utf8'));
    if (!Array.isArray(data)) throw new Error('Account storage has an invalid format.');
    return data as StoredUser[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeUsers(users: StoredUser[]) {
  await ensureDataDir();
  const temp = `${USERS_FILE}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(users), { mode: 0o600, flag: 'wx' });
  await rename(temp, USERS_FILE);
}

async function getSigningKey(): Promise<Buffer> {
  await ensureDataDir();
  try { return await readFile(SECRET_FILE); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const key = randomBytes(32);
  try {
    const handle = await open(SECRET_FILE, 'wx', 0o600);
    await handle.writeFile(key);
    await handle.close();
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return readFile(SECRET_FILE);
    throw error;
  }
}

async function hashPassword(password: string, salt: Buffer) {
  return await scrypt(password, salt, 64) as Buffer;
}

async function createAccountUnlocked(name: string, email: string, password: string): Promise<{ user: PublicUser; migrateLegacyData: boolean }> {
  const cleanName = name.trim().slice(0, 80);
  const cleanEmail = email.trim().toLowerCase();
  if (cleanName.length < 2 || cleanName.length > 80) throw new Error('Name must be between 2 and 80 characters.');
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Enter a valid email address.');
  if (password.length < 10 || password.length > 256) throw new Error('Password must be between 10 and 256 characters.');
  const users = await readUsers();
  if (users.some(user => user.email === cleanEmail)) throw new Error('An account with this email already exists.');
  const salt = randomBytes(16);
  const user: StoredUser = {
    id: randomUUID(), name: cleanName, email: cleanEmail,
    salt: salt.toString('hex'), passwordHash: (await hashPassword(password, salt)).toString('hex'),
    createdAt: new Date().toISOString()
  };
  await writeUsers([...users, user]);
  return { user: { id: user.id, name: user.name, email: user.email }, migrateLegacyData: users.length === 0 };
}

export async function createAccount(name: string, email: string, password: string) {
  if (!isLocalFileAuthAllowed()) throw new SupabaseSetupError();
  const previous = accountWriteQueue;
  let release!: () => void;
  accountWriteQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await createAccountUnlocked(name, email, password); }
  finally { release(); }
}

export async function authenticateAccount(email: string, password: string): Promise<PublicUser | null> {
  if (!isLocalFileAuthAllowed()) throw new SupabaseSetupError();
  const cleanEmail = email.trim().toLowerCase();
  const users = await readUsers();
  const user = users.find(item => item.email === cleanEmail);
  const salt = user ? Buffer.from(user.salt, 'hex') : Buffer.alloc(16);
  const expected = user ? Buffer.from(user.passwordHash, 'hex') : Buffer.alloc(64);
  const actual = await hashPassword(password.slice(0, 256), salt);
  if (!user || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { id: user.id, name: user.name, email: user.email };
}

export async function makeSession(user: PublicUser): Promise<string> {
  if (!isLocalFileAuthAllowed()) throw new SupabaseSetupError();
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url');
  const signature = createHmac('sha256', await getSigningKey()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export async function getSessionUser(): Promise<PublicUser | null> {
  if (!isLocalFileAuthAllowed()) {
    if (!hasSupabaseConfig()) throw new SupabaseSetupError();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    // A visitor without a Supabase session is simply signed out. Supabase
    // reports that normal state as AuthSessionMissingError (HTTP 400).
    if (error && error.name !== 'AuthSessionMissingError') throw error;
    if (error) return null;
    if (!data.user) return null;
    return {
      id: data.user.id,
      name: getSupabaseProfileName(data.user.user_metadata),
      email: data.user.email ?? ''
    };
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 2048) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  const expected = createHmac('sha256', await getSigningKey()).update(payload).digest();
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  let parsed: { sub?: unknown; exp?: unknown };
  try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (typeof parsed.sub !== 'string' || typeof parsed.exp !== 'number' || parsed.exp < Date.now() / 1000) return null;
  const user = (await readUsers()).find(item => item.id === parsed.sub);
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

/** Local file authentication is intentionally disabled in production/serverless runtimes. */
export function isLocalFileAuthAllowed() {
  return process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1' && !hasSupabaseConfig();
}

export async function signUpWithSupabase(name: string, email: string, password: string) {
  if (!hasSupabaseConfig()) throw new SupabaseSetupError();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } }
  });
  if (error) throw error;
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw Object.assign(new Error('An account with this email already exists.'), { code: 'user_already_exists' });
  }
  return {
    user: data.user ? {
      id: data.user.id,
      name: getSupabaseProfileName(data.user.user_metadata) || name,
      email: data.user.email ?? email
    } : null,
    needsEmailConfirmation: Boolean(data.user && !data.session),
    migrateLegacyData: Boolean(data.user && data.session)
  };
}

export async function signInWithSupabase(email: string, password: string): Promise<PublicUser | null> {
  if (!hasSupabaseConfig()) throw new SupabaseSetupError();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) return null;
  return {
    id: data.user.id,
    name: getSupabaseProfileName(data.user.user_metadata),
    email: data.user.email ?? email
  };
}

export async function signOutSupabase() {
  if (!hasSupabaseConfig()) throw new SupabaseSetupError();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export { SESSION_SECONDS };
