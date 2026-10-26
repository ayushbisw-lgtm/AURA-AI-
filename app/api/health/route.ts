import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2500), cache: 'no-store' });
    if (!response.ok) return NextResponse.json({ ok: false });
    const data = await response.json();
    const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
    const models: string[] = (data.models || []).map((m: { name?: string }) => m.name || '');
    return NextResponse.json({ ok: models.some(m => m === model || m.startsWith(`${model}:`)), model });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
