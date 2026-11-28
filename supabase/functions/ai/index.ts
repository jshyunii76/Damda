// 담다 AI: 학생이 키를 넣지 않아도 Gemini 를 쓰게 대신 불러 주는 함수
// - 로그인한 사람만, 사람마다 하루 한도 + 전체 하루 한도 (ai.sql 의 ai_take)
// - 앱이 쓰는 가벼운 모델만, 앱이 보내는 항목만 골라 '다시 만들어' 보낸다
//   (비싼 모델·검색 도구·아주 긴 출력·큰 사진 여러 장으로 비용을 키우지 못하게)
// - 키는 Supabase 비밀값 GEMINI_API_KEY 에만 둔다 (코드·화면에 없음). 메모 내용은 로그에 남기지 않는다

const ORIGINS = [
  'https://jshyunii76.github.io', 'https://pikachu515.github.io',
  'http://localhost:8765', 'http://127.0.0.1:8765',
];
const G_BASE = 'https://generativelanguage.googleapis.com/v1beta/';
const MAX_BODY = 6 * 1024 * 1024, TIMEOUT = 60000;
/* 앱(index.html 의 G_TEXT·G_EMB)과 같은 목록 */
export const MODELS = {
  gen: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'],
  emb: ['gemini-embedding-2', 'gemini-embedding-2-preview', 'gemini-embedding-001'],
};
const IMG = ['image/jpeg', 'image/png', 'image/webp'], MAX_IMG = 4, MAX_IMG_B64 = 4 * 1024 * 1024;
const MAX_TEXT = 30000, MAX_OUT = 2048;

/* 허용하는 주소면 {kind, model}, 아니면 null */
export function kindOf(path) {
  const m = /^models\/([a-z0-9.\-]{1,60}):(generateContent|embedContent)$/.exec(String(path || ''));
  if (!m) return null;
  const kind = m[2] === 'generateContent' ? 'gen' : 'emb';
  return MODELS[kind].includes(m[1]) ? { kind, model: m[1] } : null;
}

const str = (v, max) => typeof v === 'string' && v.length <= max ? v : null;
/* 앱이 보내는 모양만 골라 새로 만든다. 모양이 다르면 null */
export function clean(kind, model, b) {
  if (!b || typeof b !== 'object') return null;
  if (kind === 'emb') {
    const t = b.content && Array.isArray(b.content.parts) && b.content.parts.length === 1 && str(b.content.parts[0].text, 8000);
    if (typeof t !== 'string') return null;
    const d = Number.isInteger(b.outputDimensionality) && b.outputDimensionality >= 64 && b.outputDimensionality <= 3072 ? b.outputDimensionality : 256;
    return { model: 'models/' + model, content: { parts: [{ text: t }] }, outputDimensionality: d };
  }
  if (!Array.isArray(b.contents) || !b.contents.length || b.contents.length > 8) return null;
  let imgs = 0, imgB = 0, txt = 0;
  const contents = [];
  for (const c of b.contents) {
    if (!c || (c.role !== 'user' && c.role !== 'model') || !Array.isArray(c.parts) || !c.parts.length || c.parts.length > 12) return null;
    const parts = [];
    for (const p of c.parts) {
      if (p && typeof p.text === 'string') { txt += p.text.length; parts.push({ text: p.text }); continue; }
      const d = p && p.inlineData;
      if (d && IMG.includes(d.mimeType) && typeof d.data === 'string') { imgs++; imgB += d.data.length; parts.push({ inlineData: { mimeType: d.mimeType, data: d.data } }); continue; }
      return null;
    }
    contents.push({ role: c.role, parts });
  }
  if (txt > MAX_TEXT || imgs > MAX_IMG || imgB > MAX_IMG_B64) return null;
  const g = b.generationConfig || {}, out = { contents };
  out.generationConfig = {
    temperature: typeof g.temperature === 'number' ? Math.max(0, Math.min(1.2, g.temperature)) : 0.3,
    maxOutputTokens: Number.isInteger(g.maxOutputTokens) ? Math.max(16, Math.min(MAX_OUT, g.maxOutputTokens)) : 1024,
    ...(g.responseMimeType === 'application/json' ? { responseMimeType: 'application/json' } : {}),
  };
  const si = b.systemInstruction && Array.isArray(b.systemInstruction.parts) && b.systemInstruction.parts.length === 1 && str(b.systemInstruction.parts[0].text, 20000);
  if (si) out.systemInstruction = { parts: [{ text: si }] };
  return out;
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
  const fail = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { ...head, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: head });
  if (req.method !== 'POST') return fail(405, 'method');
  if (!key) return fail(503, 'nokey');
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return fail(413, 'big');

  let raw;
  try { raw = await req.text(); } catch { return fail(400, 'body'); }
  if (raw.length > MAX_BODY) return fail(413, 'big');
  let q;
  try { q = JSON.parse(raw); } catch { return fail(400, 'body'); }
  const k = kindOf(q && q.path);
  if (!k) return fail(400, 'path');
  const body = clean(k.kind, k.model, q.body);
  if (!body) return fail(400, 'body');

  const left = await count(req, k.kind);
  if (left === null) return fail(401, 'login');
  if (left < 0) return fail(429, 'limit');

  try {
    const r = await fetcher(G_BASE + 'models/' + k.model + ':' + (k.kind === 'gen' ? 'generateContent' : 'embedContent'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT),
    });
    const text = await r.text();
    if (!r.ok) {
      console.warn('gemini', k.kind, r.status);
      /* 키·프로젝트 문제(401·403·429)는 학생 탓이 아니므로 '잠시 뒤'로만 알린다 */
      if (r.status === 401 || r.status === 403 || r.status === 429) return fail(502, 'upstream');
    }
    return new Response(text, { status: r.status, headers: { ...head, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.warn('gemini', k.kind, e && e.name);
    return fail(502, 'net');
  }
}

if (typeof Deno !== 'undefined') Deno.serve(req => handle(req));
