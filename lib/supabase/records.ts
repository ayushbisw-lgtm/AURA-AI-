'use client';

import { createSupabaseBrowserClient } from './browser.ts';
import { hasSupabaseConfig } from './config.ts';

export function cloudDataEnabled() {
  return hasSupabaseConfig();
}

export async function loadCloudRecords<T>(userId: string, collection: string): Promise<T[]> {
  const { data, error } = await createSupabaseBrowserClient().from('aura_records')
    .select('data').eq('user_id', userId).eq('collection', collection);
  if (error) throw new Error('Could not load your saved data from Supabase.');
  return (data ?? []).map(row => row.data as T);
}

export async function saveCloudRecord<T>(userId: string, collection: string, id: string, record: T): Promise<void> {
  const { error } = await createSupabaseBrowserClient().from('aura_records').upsert({
    user_id: userId, collection, record_id: id, data: record
  }, { onConflict: 'user_id,collection,record_id' });
  if (error) throw new Error('Could not save your data to Supabase.');
}

export async function deleteCloudRecord(userId: string, collection: string, id: string): Promise<void> {
  const { error } = await createSupabaseBrowserClient().from('aura_records')
    .delete().eq('user_id', userId).eq('collection', collection).eq('record_id', id);
  if (error) throw new Error('Could not delete your saved data from Supabase.');
}

export async function clearCloudCollection(userId: string, collection: string): Promise<void> {
  const { error } = await createSupabaseBrowserClient().from('aura_records')
    .delete().eq('user_id', userId).eq('collection', collection);
  if (error) throw new Error('Could not clear your saved data from Supabase.');
}
