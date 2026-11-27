// 담다 AI: 학생이 키를 넣지 않아도 Gemini 를 쓰게 대신 불러 주는 함수
// - 로그인한 사람만, 사람마다 하루 한도 (ai.sql 의 ai_take)
// - Gemini 의 '글 만들기·벡터 만들기' 두 가지 주소만. 아무 요청이나 넘기는 통로가 되지 않게 한다
// - 키는 Supabase 비밀값 GEMINI_API_KEY 에만 둔다 (코드·화면에 없음). 메모 내용은 로그에 남기지 않는다

const ORIGINS = [
  'https://jshyunii76.github.io', 'https://pikachu515.github.io',
  'http://localhost:8765', 'http://127.0.0.1:8765',
];
const G_BASE = 'https://generativelanguage.googleapis.com/v1beta/';
const MAX_BODY = 8 * 1024 * 1024, TIMEOUT = 60000;

/* 허용하는 주소면 'gen'·'emb', 아니면 null */
export function kindOf(path) {
  const m = /^models\/((?:gemini|text-embedding)[a-z0-9.\-]{0,60}):(generateContent|embedContent)$/.exec(String(path || ''));
  if (!m) return null;
  return m[2] === 'generateContent' ? 'gen' : 'emb';
}

/* 로그인 확인 + 하루 한도 한 번 쓰기. 남은 횟수(0 이상), 한도 넘음 -1, 로그인 아님 null */
export async function take(req, kind, base, fetcher = fetch) {
  const auth = req.headers.get('authorization') || '', key = req.headers.get('apikey') || '';
  if (!/^Bearer \S+$/.test(auth) || !key || !base) return null;
  try {
    const r = await fetcher(base + '/rest/v1/rpc/ai_take', {
      method: 'POST', headers: { Authorization: auth, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: kind }), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;                 /* 로그인 안 한 공개 키로는 ai_take 를 부를 수 없다 */
    const n = await r.json();
    return typeof n === 'number' ? n : null;
  } catch { return null; }
}

export async function handle(req, {
  fetcher = fetch,
  key = (typeof Deno !== 'undefined' ? Deno.env.get('GEMINI_API_KEY') : ''),
  count = (r, k) => take(r, k, typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_URL') : ''),
} = {}) {
  const origin = req.headers.get('origin') || '';
  const head = {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin', 'Cache-Control': 'no-store',
  };
  const fail = (status, error, left) => new Response(JSON.stringify({ error, ...(left !== undefined ? { left } : {}) }), { status, headers: { ...head, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: head });
  if (req.method !== 'POST') return fail(405, 'method');
  if (!key) return fail(503, 'nokey');

  let raw;
  try { raw = await req.text(); } catch { return fail(400, 'body'); }
  if (raw.length > MAX_BODY) return fail(413, 'big');
  let q;
  try { q = JSON.parse(raw); } catch { return fail(400, 'body'); }
  const kind = kindOf(q && q.path);
  if (!kind || !q.body || typeof q.body !== 'object') return fail(400, 'path');

  const left = await count(req, kind);
  if (left === null) return fail(401, 'login');
  if (left < 0) return fail(429, 'limit', 0);

  try {
    const r = await fetcher(G_BASE + q.path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(q.body), signal: AbortSignal.timeout(TIMEOUT),
    });
    const text = await r.text();
    if (!r.ok) console.warn('gemini', kind, r.status);
    return new Response(text, { status: r.status, headers: { ...head, 'Content-Type': 'application/json', 'x-ai-left': String(left) } });
  } catch (e) {
    console.warn('gemini', kind, e && e.name);
    return fail(502, 'net');
  }
}

if (typeof Deno !== 'undefined') Deno.serve(req => handle(req));
