// Canvas 캘린더 피드(.ics)를 대신 받아 주는 함수 (2바퀴)
// 브라우저는 CORS 때문에 학교 Canvas에서 직접 받을 수 없다.
// - 로그인한 사람만 (Supabase 함수의 JWT 검사 켜 둘 것)
// - Canvas 피드 모양의 주소만. 아무 주소나 받아 주는 프록시가 되지 않게 한다
// - 피드 주소는 열쇠와 같으므로 로그에 남기지 않는다

const ORIGINS = [
  'https://jshyunii76.github.io', 'https://pikachu515.github.io',
  'http://localhost:8765', 'http://127.0.0.1:8765',
];
const MAX = 2 * 1024 * 1024, TIMEOUT = 10000;

/* 받아도 되는 주소면 URL, 아니면 null */
export function checkUrl(s) {
  let u;
  try { u = new URL(String(s || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  if (u.search || u.hash) return null;
  if (!/^\/feeds\/calendars\/user_[A-Za-z0-9]{10,100}\.ics$/.test(u.pathname)) return null;
  const h = u.hostname.toLowerCase();
  /* 학교 도메인과 Canvas 본사 주소만: IP·localhost·내부 이름은 여기서 모두 걸러진다 */
  if (!/^([a-z0-9-]+\.)+(ac\.kr|edu|instructure\.com)$/.test(h)) return null;
  return u;
}

export async function readLimited(res, max = MAX) {
  const rd = res.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.length;
    if (n > max) { await rd.cancel(); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(n);
  let off = 0;
  for (const p of parts) { all.set(p, off); off += p.length; }
  return new TextDecoder().decode(all);
}

export async function handle(req, fetcher = fetch) {
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

  let body;
  try { body = await req.json(); } catch { return fail(400, 'url'); }
  const u = checkUrl(body && body.url);
  if (!u) return fail(400, 'url');

  const ac = new AbortController(), t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const res = await fetcher(u.href, { redirect: 'manual', signal: ac.signal, headers: { Accept: 'text/calendar' } });
    /* 404·401·로그인 화면으로 보내기 = 주소가 바뀌었거나 만료됨 */
    if (!res.ok) { console.warn('feed', u.hostname, res.status); return fail(res.status >= 500 ? 502 : 422, res.status >= 500 ? 'net' : 'feed'); }
    const text = await readLimited(res);
    if (text === null) return fail(422, 'big');
    if (!text.startsWith('BEGIN:VCALENDAR')) return fail(422, 'feed');
    return new Response(text, { headers: { ...head, 'Content-Type': 'text/calendar; charset=utf-8' } });
  } catch (e) {
    console.warn('feed', u.hostname, e && e.name);
    return fail(502, 'net');
  } finally { clearTimeout(t); }
}

if (typeof Deno !== 'undefined') Deno.serve(req => handle(req));
