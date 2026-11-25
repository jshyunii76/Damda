// 시험용 가짜 Supabase: PGlite(setup.sql + rooms.sql) + 담다 정적 파일
// localhost:8765 와 127.0.0.1:8765 로 열면 저장소가 분리돼 두 사람처럼 쓸 수 있다
import { PGlite } from '@electric-sql/pglite';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { handle } from '../supabase/functions/canvas-feed/index.ts';

const APP = resolve(process.argv[2]), SQL = join(APP, 'supabase');
const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin;
grant usage on schema public to anon, authenticated;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated; grant select, insert, update, delete on storage.objects to authenticated;
create publication supabase_realtime;`);
await db.exec(readFileSync(join(SQL, 'setup.sql'), 'utf8'));
await db.exec(readFileSync(join(SQL, 'rooms.sql'), 'utf8'));
for (const c of 'abc') await db.query('insert into auth.users values ($1)', ['00000000-0000-0000-0000-00000000000' + c]);
const blobs = new Map();
let feed = { status: 200, text: readFileSync(new URL('./fixtures/sample.ics', import.meta.url), 'utf8') }, feedCalls = 0;
let q = Promise.resolve();   // 요청을 하나씩 (역할 전환이 섞이지 않게)
const serial = fn => (q = q.then(fn, fn));

async function asUser(uid, sql, params) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try { const r = await db.query(sql, params); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { error: { message: e.message, code: e.code } }; }
  finally { await db.exec('reset role'); }
}
const body = req => new Promise(r => { const c = []; req.on('data', x => c.push(x)); req.on('end', () => r(Buffer.concat(c))); });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/sql') {
      const { uid, sql, params } = JSON.parse(await body(req));
      const out = await serial(() => asUser(uid, sql, params || []));
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(out));
    }
    if (url.pathname === '/api/upload') {
      const uid = url.searchParams.get('uid'), path = url.searchParams.get('path'), buf = await body(req);
      const out = await serial(() => asUser(uid, `insert into storage.objects (bucket_id, name) values ('files', $1)`, [path]));
      if (!out.error) blobs.set(path, { buf, type: req.headers['content-type'] });
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(out));
    }
    if (url.pathname === '/api/download') {
      const uid = url.searchParams.get('uid'), path = url.searchParams.get('path');
      const out = await serial(() => asUser(uid, `select 1 from storage.objects where bucket_id = 'files' and name = $1 limit 1`, [path]));
      const b = blobs.get(path);
      if (out.error || !out.rows.length || !b) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': b.type || 'application/octet-stream' }); return res.end(b.buf);
    }
    if (url.pathname === '/api/fn/canvas-feed') {   /* 진짜 함수 코드를 그대로 쓰고, 학교 LMS 응답만 가짜 */
      if (!url.searchParams.get('uid')) { res.writeHead(401); return res.end(); }
      feedCalls++;
      const r = await handle(new Request('http://f/', { method: 'POST', body: await body(req) }), async () => new Response(feed.text, { status: feed.status }), async () => true);
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') }); return res.end(await r.text());
    }
    if (url.pathname === '/api/fixture') {          /* 시험용: 가짜 피드 바꾸기 */
      if (req.method === 'POST') feed = JSON.parse(await body(req));
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ...feed, calls: feedCalls }));
    }
    if (url.pathname === '/api/ver') {
      const r = await serial(() => db.query(`select (select coalesce(max(updated_at)::text,'') from public.room_msgs) || (select count(*)::text from public.room_members) || (select count(*)::text from public.room_msgs) || (select string_agg(perm,'') from public.rooms) v`));
      res.writeHead(200); return res.end(r.rows[0].v);
    }
    if (url.pathname === '/api/peek') {   // 시험 확인용: 서버 표 내용
      const r = await serial(() => db.query(`select m.room_id, m.id, m.data->>'text' text, m.deleted, a.display_name author, e.display_name edited_by
        from public.room_msgs m left join public.room_members a on a.room_id=m.room_id and a.user_id=m.author
        left join public.room_members e on e.room_id=m.room_id and e.user_id=m.edited_by order by m.updated_at`));
      const r2 = await serial(() => db.query(`select r.code, r.name, r.perm, m.display_name, m.role from public.rooms r join public.room_members m on m.room_id=r.id order by r.code, m.joined_at`));
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ msgs: r.rows, members: r2.rows }, null, 1));
    }
    if (url.pathname === '/mock-supabase.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(readFileSync(new URL('./mock-supabase.js', import.meta.url))); }
    if (url.pathname === '/sw.js') { res.writeHead(404); return res.end(); }
    let f = join(APP, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!f.startsWith(APP) || !existsSync(f)) { res.writeHead(404); return res.end(); }
    let data = readFileSync(f);
    if (f.endsWith('index.html')) data = Buffer.from(data.toString('utf8').replace(/const SB_JS='[^']*';/, "const SB_JS='/mock-supabase.js';")
      /* 시험용: 앱 내부를 window.__dbg 로 들여다볼 수 있게 (가짜 서버에서만) */
      .replace(/\r?\nboot\(\);\r?\n\}\)\(\);/, "\nwindow.__dbg={RS,saveList,readList,refreshView,get rooms(){return rooms},get cur(){return cur},get me(){return me}};\nboot();\n})();"));
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(data);
  } catch (e) { console.error(e); res.writeHead(500); res.end(String(e)); }
}).listen(8765, () => console.log('mock supabase on :8765'));
