/**
 * The agent's knowledge: our wiki.
 *
 * The brief is specific about this. The agent's knowledge is our wiki —
 * wiki.acreetionos.org, whose content lives in the acreetionos-code.github.io
 * repository — plus the course itself. It answers from that material and not
 * from the open internet's opinion. When the wiki grows, the agent's
 * knowledge grows with it.
 *
 * So the wiki is fetched at request time rather than baked into the worker.
 * A copy frozen into the deployment would be a copy that quietly goes stale,
 * and a helper that answers from a stale copy is worse than no helper.
 */

/** Where the wiki content comes from. */
const WIKI_SOURCES = [
  {
    name: 'wiki index',
    url: 'https://raw.githubusercontent.com/acreetionos-code/acreetionos-code.github.io/main/llms.txt',
    weight: 1.0,
  },
  {
    name: 'wiki digest',
    url: 'https://raw.githubusercontent.com/acreetionos-code/acreetionos-code.github.io/main/llms-full.txt',
    weight: 1.2,
  },
  {
    name: 'building your own ISO',
    url: 'https://raw.githubusercontent.com/acreetionos-code/acreetionos-code.github.io/main/wiki-guides/building-your-own-iso.html',
    weight: 1.4,
  },
  {
    name: 'installing software',
    url: 'https://raw.githubusercontent.com/acreetionos-code/acreetionos-code.github.io/main/wiki-guides/installing-software.html',
    weight: 1.1,
  },
  {
    name: 'system maintenance',
    url: 'https://raw.githubusercontent.com/acreetionos-code/acreetionos-code.github.io/main/wiki-guides/system-maintenance.html',
    weight: 1.1,
  },
  {
    name: 'firewall',
    url: 'https://raw.githubusercontent.com/acreetionos-code/acreetionos-code.github.io/main/wiki-guides/firewall.html',
    weight: 1.0,
  },
  {
    name: 'wifi',
    url: 'https://raw.githubusercontent.com/acreetionos-code/acreetionos-code.github.io/main/wiki-guides/wifi.html',
    weight: 1.0,
  },
  {
    name: 'nvidia drivers',
    url: 'https://raw.githubusercontent.com/acreetionos-code/acreetionos-code.github.io/main/wiki-guides/nvidia-drivers.html',
    weight: 1.0,
  },
  {
    name: 'bluetooth',
    url: 'https://raw.githubusercontent.com/acreetionos-code/acreetionos-code.github.io/main/wiki-guides/bluetooth.html',
    weight: 1.0,
  },
  {
    name: 'printer setup',
    url: 'https://raw.githubusercontent.com/acreetionos-code/acreetionos-code.github.io/main/wiki-guides/printer-setup.html',
    weight: 1.0,
  },
];

/** How long a fetched copy of the wiki is considered fresh. */
const CACHE_TTL_MS = 15 * 60 * 1000;

let cache = null;
let cachedAt = 0;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'and',
  'or', 'but', 'if', 'then', 'else', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
  'without', 'from', 'by', 'about', 'as', 'it', 'its', 'this', 'that', 'these',
  'those', 'i', 'my', 'me', 'you', 'your', 'we', 'our', 'do', 'does', 'did',
  'can', 'could', 'should', 'would', 'will', 'how', 'what', 'why', 'when',
  'where', 'which', 'who', 'there', 'here', 'not', 'no', 'so', 'up', 'out',
]);

/** Split a question into the words worth searching with. */
function terms(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Fetch the wiki, or return the cached copy if it is still fresh.
 * A failed fetch returns whatever we last had, or an empty set. The agent
 * handles an empty knowledge base honestly rather than pretending.
 */
export async function loadWiki(env) {
  const now = Date.now();
  if (cache && now - cachedAt < CACHE_TTL_MS) return cache;

  const results = await Promise.all(
    WIKI_SOURCES.map(async (source) => {
      try {
        const response = await fetch(source.url, {
          headers: { 'user-agent': 'acreetionos-academy-agent' },
          cf: { cacheTtl: 900 },
        });
        if (!response.ok) return null;
        const text = await response.text();
        return { name: source.name, weight: source.weight, text: stripMarkup(text) };
      } catch {
        return null;
      }
    })
  );

  const documents = results.filter(Boolean);
  if (!documents.length) {
    // Keep serving what we had rather than losing the knowledge entirely.
    return cache || [];
  }

  cache = documents.map((doc) => ({ ...doc, chunks: chunk(doc.text) }));
  cachedAt = now;
  return cache;
}

/** Turn HTML into plain text, keeping the headings readable. */
function stripMarkup(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Split a document into overlapping chunks. Chunks are small enough to be
 * retrieved precisely and big enough to carry a whole thought.
 */
function chunk(text, size = 1200, overlap = 200) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const out = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > size) {
      out.push(current.trim());
      current = current.slice(Math.max(0, current.length - overlap));
    }
    current += (current ? '\n\n' : '') + paragraph;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter((c) => c.length > 40);
}

/**
 * Pick the chunks most likely to answer a question.
 *
 * This is a plain keyword score, not a vector search. It is predictable, it
 * runs in a worker without a vector database, and for a wiki this size it
 * finds the right page. The agent is told to say when the material does not
 * cover the question, which is the part that actually matters for honesty.
 */
export function selectContext(documents, question, courseText, limit = 8) {
  const queryTerms = terms(question);
  if (!queryTerms.length) {
    return { passages: [], covered: false };
  }

  const scored = [];

  for (const doc of documents) {
    for (const text of doc.chunks) {
      const chunkTerms = terms(text);
      const counts = new Map();
      for (const term of chunkTerms) counts.set(term, (counts.get(term) || 0) + 1);

      let score = 0;
      for (const term of queryTerms) {
        if (counts.has(term)) score += 1 + Math.log(counts.get(term));
      }
      if (score > 0) {
        // Reward chunks where the term is not buried in a wall of text.
        const density = score / Math.sqrt(text.length);
        scored.push({ score: score * (0.5 + density), text, source: doc.name });
      }
    }
  }

  if (courseText) {
    for (const piece of courseText) {
      const pieceTerms = terms(piece.text);
      let score = 0;
      for (const term of queryTerms) {
        if (pieceTerms.includes(term)) score += 1;
      }
      if (score > 0) {
        scored.push({ score: score * 1.3, text: piece.text, source: `course: ${piece.label}` });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const passages = [];
  const seen = new Set();
  for (const item of scored) {
    const key = item.text.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    passages.push(item);
    if (passages.length >= limit) break;
  }

  return { passages, covered: passages.length > 0 };
}
