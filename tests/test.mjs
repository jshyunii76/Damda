// rooms.sql 시험: Supabase의 auth·storage·역할을 흉내 낸 PGlite에서 setup.sql → rooms.sql(2번) 실행 후 권한 시험
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const dir = process.argv[2];
const db = new PGlite();
const MOCK = `
create role anon nologin; create role authenticated nologin;
grant usage on schema public to anon, authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated; grant select, insert, update, delete on storage.objects to authenticated;
create publication supabase_realtime;
create schema realtime;
create table realtime.messages (id serial primary key, topic text, extension text, payload jsonb);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
grant usage on schema realtime to authenticated; grant select, insert on realtime.messages to authenticated; grant usage on sequence realtime.messages_id_seq to authenticated;
`;
await db.exec(MOCK);
await db.exec(readFileSync(dir + '/setup.sql', 'utf8'));
await db.exec(readFileSync(dir + '/rooms.sql', 'utf8'));
await db.exec(readFileSync(dir + '/rooms.sql', 'utf8'));   // 두 번 실행해도 되는지
await db.exec(readFileSync(dir + '/meet.sql', 'utf8')); await db.exec(readFileSync(dir + '/meet.sql', 'utf8'));
console.log('SQL 실행 OK (setup.sql + rooms.sql ×2 + meet.sql ×2)');

const U = { A: '00000000-0000-0000-0000-00000000000a', B: '00000000-0000-0000-0000-00000000000b', C: '00000000-0000-0000-0000-00000000000c' };
for (const id of Object.values(U)) await db.query('insert into auth.users values ($1)', [id]);

let pass = 0, fail = 0;
async function as(who, sql, params = []) {
  await db.exec('reset role');
  if (who === 'anon') await db.exec(`select set_config('request.jwt.claim.sub','',false); set role anon`);
  else await db.exec(`select set_config('request.jwt.claim.sub','${U[who]}',false); set role authenticated`);
  try { const r = await db.query(sql, params); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { err: e.message }; }
  finally { await db.exec('reset role'); }
}
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✅ ' : '  ❌ ') + name + (ok ? '' : '  → ' + JSON.stringify(detail)));
}

// T1 방 만들기·참여
let r = await as('A', `select public.create_room('ABCDEF','경영 5팀','edit','상현') as id`);
const rid = r.rows?.[0]?.id; check('A 방 만들기', !!rid, r);
r = await as('A', `select public.create_room('ABCDEF','중복','edit','상현')`); check('같은 코드로 또 만들기 → 거절', !!r.err, r);
r = await as('A', `insert into public.room_msgs (room_id,id,data) values ($1,'m1','{"text":"자료"}')`, [rid]); check('A 메모 쓰기', !r.err, r);
r = await as('B', `select * from public.room_msgs`); check('B(멤버 아님) 메모 안 보임', r.rows?.length === 0, r);
r = await as('B', `select * from public.rooms`); check('B(멤버 아님) 방 안 보임', r.rows?.length === 0, r);
r = await as('B', `select * from public.join_room('ZZZZZZ','우진')`); check('없는 코드 참여 → 빈 결과', r.rows?.length === 0, r);
r = await as('B', `select * from public.join_room('abcdef','우진')`); check('B 코드로 참여(소문자도)', r.rows?.[0]?.room_id === rid, r);
r = await as('B', `select * from public.join_room('ABCDEF','우진2')`); check('B 다시 참여해도 오류 없음', !r.err, r);
r = await as('B', `select data->>'text' t from public.room_msgs`); check('B 참여 후 A 메모 보임 (T1)', r.rows?.[0]?.t === '자료', r);

// T2 작성자 기록
r = await as('B', `insert into public.room_msgs (room_id,id,data,author) values ($1,'m2','{"text":"사진"}',$2)`, [rid, U.A]);
check('B 메모 쓰기', !r.err, r);
r = await as('A', `select author from public.room_msgs where id='m2'`); check('작성자 위조 불가 (B가 A라고 보내도 B로 기록)', r.rows?.[0]?.author === U.B, r);
r = await as('B', `update public.room_msgs set data='{"text":"자료 수정"}', author=$1 where id='m1'`, [U.B]); check('B가 A 메모 고치기', r.n === 1, r);
r = await as('A', `select author, edited_by from public.room_msgs where id='m1'`);
check('고쳐도 작성자는 A 유지, edited_by=B', r.rows?.[0]?.author === U.A && r.rows?.[0]?.edited_by === U.B, r);
r = await as('B', `delete from public.room_msgs where id='m1'`); check('줄 삭제는 불가(지움 표시만)', !!r.err || r.n === 0, r);

// T3 멤버 목록
r = await as('A', `select display_name from public.room_members order by joined_at`); check('A가 멤버 이름 목록 봄 (T3)', r.rows?.map(x => x.display_name).join() === '상현,우진', r);
r = await as('B', `update public.room_members set display_name='해킹' where user_id=$1`, [U.A]); check('B가 A 이름 못 바꿈', !!r.err || r.n === 0, r);
r = await as('B', `update public.room_members set role='owner' where user_id=$1`, [U.B]); check('B가 자기를 방장으로 못 바꿈', !!r.err || r.n === 0, r);
r = await as('B', `update public.room_members set display_name='우진😀' where user_id=$1`, [U.B]); check('B 자기 이름 바꾸기', r.n === 1, r);
r = await as('C', `insert into public.room_members (room_id,user_id) values ($1,$2)`, [rid, U.C]); check('C가 멤버 표에 직접 끼어들기 불가', !!r.err, r);

// T4 보기만 권한
r = await as('B', `update public.rooms set perm='view' where id=$1`, [rid]); check('B(멤버)는 권한 못 바꿈', !!r.err || r.n === 0, r);
r = await as('A', `update public.rooms set perm='view' where id=$1`, [rid]); check('A(방장) 보기만으로 바꿈', r.n === 1, r);
r = await as('A', `update public.rooms set owner=$2 where id=$1`, [rid, U.B]); check('방장도 owner 칸은 못 바꿈', !!r.err, r);
r = await as('B', `insert into public.room_msgs (room_id,id,data) values ($1,'m3','{}')`, [rid]); check('보기만 방에서 B 쓰기 → 서버 거절 (T4)', !!r.err, r);
r = await as('B', `update public.room_msgs set deleted=true where id='m2'`); check('보기만 방에서 B 지움표시 → 거절', !!r.err || r.n === 0, r);
r = await as('A', `insert into public.room_msgs (room_id,id,data) values ($1,'m3','{}')`, [rid]); check('보기만 방이어도 방장은 쓰기', !r.err, r);

// T5 바깥 사람
r = await as('C', `select count(*)::int n from public.room_msgs`); check('C(멤버 아님) 메모 0개 (T5)', r.rows?.[0]?.n === 0, r);
r = await as('C', `insert into public.room_msgs (room_id,id,data) values ($1,'x','{}')`, [rid]); check('C 메모 쓰기 거절', !!r.err, r);
r = await as('anon', `select * from public.rooms`); check('로그인 안 한 사람 접근 거절', !!r.err, r);
r = await as('anon', `select * from public.join_room('ABCDEF','x')`); check('로그인 안 한 사람 참여 거절', !!r.err, r);
r = await as('C', `select * from private.join_fail`); check('C가 private 표 못 읽음', !!r.err, r);

// 옮기기용: 내가 방장인 방 찾기 (#3)
r = await as('A', `select public.my_room_by_code('abcdef') as id`); check('방장은 코드로 내 방 찾음', r.rows?.[0]?.id === rid, r);
r = await as('B', `select public.my_room_by_code('ABCDEF') as id`); check('방장이 아니면 못 찾음(null)', r.rows?.[0]?.id === null, r);
r = await as('anon', `select public.my_room_by_code('ABCDEF')`); check('로그인 안 하면 거절', !!r.err, r);

// 코드 맞히기 제한
for (let i = 0; i < 10; i++) await as('C', `select * from public.join_room('QQQQQ${'23456789AB'[i]}','c')`);
r = await as('C', `select * from public.join_room('ABCDEF','c')`); check('10번 틀린 뒤 맞는 코드도 차단', /too many/.test(r.err || ''), r);

// 사진·파일
await as('A', `update public.rooms set perm='edit' where id=$1`, [rid]);
r = await as('B', `insert into storage.objects (bucket_id,name) values ('files',$1)`, [`r/${rid}/f1`]); check('B 방 사진 올리기', !r.err, r);
r = await as('A', `select name from storage.objects where name like 'r/%'`); check('A 방 사진 보임', r.rows?.length === 1, r);
r = await as('C', `select name from storage.objects`); check('C 방 사진 안 보임', r.rows?.length === 0, r);
r = await as('C', `insert into storage.objects (bucket_id,name) values ('files',$1)`, [`r/${rid}/f2`]); check('C 방에 사진 올리기 거절', !!r.err, r);
r = await as('B', `insert into storage.objects (bucket_id,name) values ('files','r/not-a-uuid/f')`); check('이상한 경로 → 오류 없이 거절', !!r.err && !/uuid/.test(r.err), r);
await as('A', `update public.rooms set perm='view' where id=$1`, [rid]);
r = await as('B', `insert into storage.objects (bucket_id,name) values ('files',$1)`, [`r/${rid}/f3`]); check('보기만 방에서 B 사진 올리기 거절', !!r.err, r);
r = await as('B', `insert into storage.objects (bucket_id,name) values ('files',$1)`, [`${U.B}/f9`]); check('개인 사진 경로는 기존대로 동작', !r.err, r);

// 실시간 등록
r = await as(null, `select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1`);
await db.exec('reset role');
r = await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1`);
check('실시간 대상 등록(room_members, room_msgs, rooms)', r.rows.map(x => x.tablename).join() === 'room_members,room_msgs,rooms', r.rows);

// 회의실 채널: 방 멤버만 (meet.sql)
const topic = async (who, t) => { await db.query(`select set_config('realtime.topic', $1, false)`, [t]); };
const rtSend = async (who, t, ext = 'broadcast') => { await topic(who, t); return as(who, `insert into realtime.messages (topic, extension, payload) values ($1, $2, '{}')`, [t, ext]); };
const rtListen = async (who, t) => { await topic(who, t); return as(who, `select 1 from realtime.messages where extension = 'broadcast' limit 1`); };
await db.query(`insert into realtime.messages (topic, extension, payload) values ('x','broadcast','{}')`);
r = await rtSend('B', 'meet:' + rid); check('회의실: 멤버 B 보내기', !r.err, r);
r = await rtSend('B', 'meet:' + rid, 'presence'); check('회의실: 멤버 B 접속 표시', !r.err, r);
r = await rtListen('A', 'meet:' + rid); check('회의실: 멤버 A 듣기', r.rows?.length === 1, r);
r = await rtSend('C', 'meet:' + rid); check('회의실: 멤버 아닌 C 보내기 거절', !!r.err, r);
r = await rtListen('C', 'meet:' + rid); check('회의실: 멤버 아닌 C 듣기 거절(0줄)', r.rows?.length === 0, r);
r = await rtSend('A', 'meet:00000000-0000-0000-0000-000000000000'); check('회의실: 없는 방 채널 거절', !!r.err, r);
r = await rtSend('A', 'meetx:' + rid); check('회의실: 다른 이름 채널 거절', !!r.err, r);
await topic(null, '');

// 담다 AI 하루 한도 (ai.sql)
await db.exec(readFileSync(dir + '/ai.sql', 'utf8')); await db.exec(readFileSync(dir + '/ai.sql', 'utf8'));
r = await as('A', `select public.ai_take('gen') n`); check('AI 한도: 첫 사용 → 59번 남음', r.rows?.[0]?.n === 59, r);
r = await as('B', `select public.ai_take('gen') n`); check('AI 한도: 사람마다 따로', r.rows?.[0]?.n === 59, r);
r = await as('A', `select public.ai_take('emb') n`); check('AI 한도: 벡터는 600번', r.rows?.[0]?.n === 599, r);
for (let i = 0; i < 59; i++) await as('A', `select public.ai_take('gen')`);
r = await as('A', `select public.ai_take('gen') n`); check('AI 한도: 61번째는 -1', r.rows?.[0]?.n === -1, r);
r = await as('A', `select public.ai_take('etc')`); check('AI 한도: 모르는 종류 거절', !!r.err, r);
r = await as('anon', `select public.ai_take('gen')`); check('AI 한도: 로그인 안 하면 거절', !!r.err, r);
await db.query(`update private.ai_total set n = 3000 where kind = 'gen'`);
r = await as('C', `select public.ai_take('gen') n`); check('AI 한도: 모두 합친 하루 한도 넘으면 -1', r.rows?.[0]?.n === -1, r);
r = await as('C', `select * from private.ai_total`); check('AI 한도: 전체 횟수 표도 직접 못 봄', !!r.err, r);
r = await as('A', `select * from private.ai_usage`); check('AI 한도: 사용 기록 표는 직접 못 봄', !!r.err, r);
r = await as('A', `update private.ai_usage set n = 0`); check('AI 한도: 횟수 직접 못 고침', !!r.err, r);

// T7 나가기
r = await as('B', `delete from public.room_members where user_id=$1`, [U.A]); check('B가 A를 내보내기 불가', r.n === 0, r);
r = await as('B', `delete from public.room_members where user_id=$1`, [U.B]); check('B 나가기 (T7)', r.n === 1, r);
r = await as('B', `select count(*)::int n from public.room_msgs`); check('나간 B는 더 이상 못 봄', r.rows?.[0]?.n === 0, r);
r = await as('A', `select count(*)::int n from public.room_msgs`); check('A 방 기록 유지', r.rows?.[0]?.n === 3, r);
r = await as('A', `delete from public.room_members where user_id=$1`, [U.A]); check('마지막 A 나가기', r.n === 1, r);
r = await db.query(`select count(*)::int n from public.rooms`); check('마지막 사람이 나가면 방 삭제', r.rows[0].n === 0, r.rows);

// 계정 삭제와 함께
await as('A', `select public.create_room('GHJKLM','두번째','edit','상현')`);
r = await as('A', `select public.delete_me()`); check('계정 삭제(delete_me) 오류 없음', !r.err, r);
r = await db.query(`select count(*)::int n from public.rooms`); check('혼자 있던 방도 같이 정리', r.rows[0].n === 0, r.rows);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
