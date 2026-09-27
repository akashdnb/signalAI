/**
 * Phase 2C Knowledge Base: plain character-based sliding-window chunking —
 * no tokenizer dependency for this slice. `overlap` repeats the tail of
 * each chunk at the start of the next one so a fact split across a chunk
 * boundary (e.g. a sentence naming a price) still appears whole in at
 * least one chunk.
 */
export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_OVERLAP = 100;

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  if (chunkSize <= 0) throw new Error("chunkSize must be positive");
  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error("overlap must be non-negative and smaller than chunkSize, or the window never advances");
  }

  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= chunkSize) return [trimmed];

  const chunks: string[] = [];
  const stride = chunkSize - overlap;
  for (let start = 0; start < trimmed.length; start += stride) {
    const chunk = trimmed.slice(start, start + chunkSize).trim();
    if (chunk) chunks.push(chunk);
    if (start + chunkSize >= trimmed.length) break;
  }
  return chunks;
}
