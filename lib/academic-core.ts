import type { RetrievedChunk, StudyChunk, StudyDocument } from './academic-types';

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'and', 'are', 'because', 'been', 'before', 'being', 'between',
  'but', 'can', 'could', 'does', 'doing', 'during', 'each', 'explain', 'from', 'have', 'into', 'its', 'just',
  'more', 'most', 'only', 'other', 'our', 'please', 'should', 'some', 'such', 'than', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'through', 'under', 'very', 'was', 'were', 'what', 'when',
  'where', 'which', 'while', 'with', 'would', 'your'
]);

export function splitStudyText(text: string, page?: number, chunkSize = 1100, overlap = 160): StudyChunk[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').trim();
  if (!normalized) return [];
  const safeChunkSize = Math.max(200, chunkSize);
  const safeOverlap = Math.min(Math.max(0, overlap), safeChunkSize - 1);
  const chunks: StudyChunk[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + safeChunkSize, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(' ', end);
      if (boundary > start + safeChunkSize * 0.65) end = boundary;
    }
    const part = normalized.slice(start, end).trim();
    if (part) chunks.push({ id: `${page ?? 'doc'}-${chunks.length}`, text: part, ...(page ? { page } : {}) });
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - safeOverlap);
  }
  return chunks;
}

function termsOf(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])]
    .filter(term => !STOP_WORDS.has(term));
}

export function retrieveStudyChunks(
  query: string,
  documents: StudyDocument[],
  subjectId?: string,
  limit = 5
): RetrievedChunk[] {
  const terms = termsOf(query);
  if (terms.length === 0 || limit <= 0) return [];

  const results: RetrievedChunk[] = [];
  for (const document of documents) {
    if (subjectId && document.subjectId !== subjectId) continue;
    for (const chunk of document.chunks) {
      const text = chunk.text.toLocaleLowerCase();
      let score = 0;
      for (const term of terms) {
        const occurrences = text.split(term).length - 1;
        if (occurrences > 0) score += Math.min(occurrences, 4) + (text.includes(`${term}s`) ? 0.2 : 0);
      }
      if (score > 0) results.push({ ...chunk, documentId: document.id, documentName: document.name, score });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function validateStudyFile(file: Pick<File, 'name' | 'size'>): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['pdf', 'txt', 'md', 'markdown'].includes(extension)) {
    return 'Choose a PDF, TXT, or Markdown file.';
  }
  if (file.size === 0) return 'This file is empty.';
  if (file.size > 10 * 1024 * 1024) return 'Files must be 10 MB or smaller.';
  return null;
}
