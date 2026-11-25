// 2바퀴 시험: Canvas 피드 해석·적용 규칙 + canvas-feed 서버 함수
import { readFileSync } from 'node:fs';
import { checkUrl, handle, signedIn } from '../supabase/functions/canvas-feed/index.ts';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.slice(html.indexOf('/*LMS-PURE-START'), html.indexOf('/*LMS-PURE-END*/'));
const L = new Function(src + '\nreturn LMSP;')();
const ics = readFileSync(new URL('./fixtures/sample.ics', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const check = (name, ok, d) => { ok ? pass++ : fail++; console.log((ok ? '  ✅ ' : '  ❌ ') + name + (ok ? '' : '  → ' + JSON.stringify(d))); };

console.log('해석');
const ev = L.parse(ics), by = Object.fromEntries(ev.map(e => [e.uid.replace('event-assignment-', ''), e]));
check('일정 6개', ev.length === 6, ev.length);
check('과목 3개(course 번호로 묶임)', new Set(ev.map(e => e.cid)).size === 3, ev.map(e => e.cid));
check('과목 이름: 끝 대괄호에서 코드 빼고', by[101].course === '가짜경영학(분반1)', by[101].course);
check('과목 이름: 특수문자', by[301].course === '가짜통계학Ⅱ:가.가짜분반', by[301].course);
check('제목에서 과목 대괄호 빠짐', by[101].title === '1주차 보고서', by[101].title);
check('제목 앞 대괄호는 남음', by[102].title === '[과제] 2주차 정리', by[102].title);
check('쉼표 풀기', by[301].title === '기말시험 대체 과제, 최종', by[301].title);
check('세계시 → 서울 시간 (13:59Z → 22:59)', by[101].due === '2026-12-01' && by[101].dueTime === '22:59', by[101]);
check('14:59Z → 23:59', by[201].due === '2026-12-10' && by[201].dueTime === '23:59', by[201]);
check('비표준 날짜형(VALUE=DATE+시간) → 날짜만', by[102].due === '2026-12-05' && by[102].dueTime === null, by[102]);
const late = L.parse(ics.replace('DTSTART:20261201T135900Z', 'DTSTART:20261231T153000Z')).find(e => e.uid.endsWith('-101'));
check('날짜가 넘어가는 변환 (12/31 15:30Z → 1/1 00:30)', late.due === '2027-01-01' && late.dueTime === '00:30', late);
check('접힌 줄(URL) 이어붙이기', by[101].url.endsWith('#assignment_101') && by[101].cid === 'course_1', by[101].url);
check('종류: 과제·퀴즈·시험', by[101].kind === '과제' && by[202].kind === '퀴즈' && by[301].kind === '시험', [by[101].kind, by[202].kind, by[301].kind]);
check('팀 과제 감지', by[201].team === true && by[101].team === false, [by[201].team, by[101].team]);
const lf = ics.replace(/\r\n/g, '\n'), crlf = lf.replace(/\n/g, '\r\n');
check('줄바꿈 LF·CRLF 같은 결과', JSON.stringify(L.parse(lf)) === JSON.stringify(L.parse(crlf)) && L.parse(crlf).length === 6);
for (const [n, t] of [['로그인 화면(HTML)', '<html>login</html>'], ['중간에 잘린 피드', ics.slice(0, 900)], ['빈 응답', '']]) {
  let err = null; try { L.parse(t); } catch (e) { err = e.message; } check(n + ' → 거절', err === 'feed', err);
}
check('javascript: 링크는 버림', L.parse(ics.replace(/URL;VALUE=URI:https:\/\/lms[^\r\n]*/, 'URL:javascript:alert(1)//'))[0].url === '');

console.log('적용');
const today = '2026-11-25', map = a => new Map(a.map(e => [e.uid, e]));
const base = ev.filter(e => e.due >= today).map((e, i) => L.make(e, 1000 + i));
check('메모 ID는 항상 같음', L.memoId(by[101]) === L.memoId(L.parse(ics)[0]));
check('ID가 파일 ID(f…)와 안 겹침, 40자 이하', base.every(m => /^c[0-9a-z]+$/.test(m.id) && m.id.length <= 40));
check('ID 서로 다름', new Set(base.map(m => m.id)).size === base.length);
let r = L.update(base, map(ev), today);
check('같은 피드 다시 → 변화 없음', !r.changed && r.list === base);
const moved = ev.map(e => e.uid.endsWith('-101') ? { ...e, due: '2026-12-08', dueTime: '10:00' } : e);
r = L.update(base.map(m => m.lms.uid.endsWith('-101') ? { ...m, done: true, note: '내 메모', pin: true } : m), map(moved), today);
let m = r.list.find(x => x.lms.uid.endsWith('-101'));
check('마감 변경 반영, 완료·메모·고정 유지', m.due === '2026-12-08' && m.dueTime === '10:00' && m.done && m.note === '내 메모' && m.pin, m);
const ren = ev.map(e => e.uid.endsWith('-101') ? { ...e, title: '1주차 보고서(수정)' } : e);
r = L.update(base, map(ren), today);
check('제목 변경 반영', r.list.find(x => x.lms.uid.endsWith('-101')).text === '[과제] 1주차 보고서(수정)');
r = L.update(base.map(x => x.lms.uid.endsWith('-101') ? { ...x, text: '내가 고친 글' } : x), map(ren), today);
check('내가 고친 글은 안 덮음', r.list.find(x => x.lms.uid.endsWith('-101')).text === '내가 고친 글');
r = L.update(base.map(x => x.lms.uid.endsWith('-101') ? { ...x, due: '2026-11-30' } : x), map(ev), today);
check('내가 고친 마감은 Canvas가 안 바뀌면 그대로', r.list.find(x => x.lms.uid.endsWith('-101')).due === '2026-11-30' && !r.changed);
const less = ev.filter(e => !e.uid.endsWith('-102'));
r = L.update(base, map(less), today); m = r.list.find(x => x.lms.uid.endsWith('-102'));
check('사라진 일정 → 지우지 않고 표시', m && m.text.endsWith('(Canvas에서 사라짐)') && m.lms.gone, m);
const again = L.update(r.list, map(less), today); check('사라짐 표시는 한 번만', !again.changed);
const back = L.update(r.list, map(ev), today).list.find(x => x.lms.uid.endsWith('-102'));
check('다시 나타나면 표시 없앰', back.text === '[과제] 2주차 정리' && !back.lms.gone, back.text);
const old = L.make(by[302], 1); r = L.update([old], map([]), today); check('지난 일정이 피드에서 빠져도 그대로', !r.changed);
const plain = [{ id: 'm1', text: '내 메모', due: '2026-12-01' }]; check('일반 메모는 안 건드림', !L.update(plain, map(ev), today).changed);

console.log('서버 함수: 주소 검사');
const ok = 'https://learning.example.ac.kr/feeds/calendars/user_abcDEF1234567890.ics';
check('정상 주소', !!checkUrl(ok)); check('앱 쪽 검사도 통과', L.okUrl(ok));
for (const [n, u] of [
  ['http', ok.replace('https', 'http')], ['IP', ok.replace('learning.example.ac.kr', '10.0.0.1')],
  ['IPv6', ok.replace('learning.example.ac.kr', '[::1]')], ['localhost', ok.replace('learning.example.ac.kr', 'localhost')],
  ['내부 이름', ok.replace('learning.example.ac.kr', 'metadata.google.internal')], ['다른 도메인', ok.replace('ac.kr', 'com')],
  ['도메인 흉내', ok.replace('ac.kr', 'ac.kr.evil.com')], ['계정 붙은 주소', ok.replace('https://', 'https://a:b@')],
  ['포트', ok.replace('ac.kr/', 'ac.kr:8443/')], ['다른 경로', 'https://learning.example.ac.kr/api/v1/users/self'],
  ['경로 빠져나가기', 'https://learning.example.ac.kr/feeds/calendars/../../user_abcDEF1234567890.ics'],
  ['물음표 붙임', ok + '?x=1'], ['빈 값', ''], ['글자 아님', { a: 1 }],
]) check(n + ' → 거절', checkUrl(u) === null, u);

console.log('서버 함수: 받기');
const call = (url, res, o = {}) => handle(new Request('https://f/', { method: o.method || 'POST', headers: { origin: o.origin || 'https://pikachu515.github.io' }, body: (o.method || 'POST') === 'POST' ? JSON.stringify({ url }) : undefined }), async (u, opt) => { call.seen = { u, opt }; if (res instanceof Error) throw res; return res; }, async () => o.login !== false);
let x = await call(ok, new Response(ics, { headers: { 'content-type': 'text/calendar' } }));
check('정상 피드 그대로 돌려줌', x.status === 200 && (await x.text()) === ics && /text\/calendar/.test(x.headers.get('content-type')));
check('리다이렉트 안 따라감', call.seen.opt.redirect === 'manual');
check('담다 주소에만 CORS 허용', x.headers.get('access-control-allow-origin') === 'https://pikachu515.github.io');
x = await call(ok, new Response(ics), { origin: 'https://evil.com' }); check('모르는 사이트엔 CORS 안 열림', x.headers.get('access-control-allow-origin') !== 'https://evil.com');
call.seen = null; x = await call('https://evil.com/', new Response(ics)); check('이상한 주소는 요청 자체를 안 보냄', x.status === 400 && call.seen === null);
for (const [n, res, e, st] of [
  ['404', new Response('no', { status: 404 }), 'feed', 422], ['로그인으로 보내기(302)', new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/' } }), 'feed', 422],
  ['학교 서버 오류(500)', new Response('x', { status: 500 }), 'net', 502], ['HTML 응답', new Response('<html>'), 'feed', 422],
  ['3MB 응답', new Response('BEGIN:VCALENDAR' + 'x'.repeat(3 * 1024 * 1024)), 'big', 422], ['연결 실패', new Error('boom'), 'net', 502],
]) { x = await call(ok, res); const j = await x.json(); check(n + ' → ' + e, x.status === st && j.error === e, [x.status, j]); }
x = await call(ok, null, { method: 'OPTIONS' }); check('OPTIONS 응답', x.status === 200);
x = await call(ok, null, { method: 'GET' }); check('GET 거절', x.status === 405);
call.seen = null; x = await call(ok, new Response(ics), { login: false }); check('로그인 안 한 사람 → 거절, 학교에 요청 안 보냄', x.status === 401 && (await x.json()).error === 'login' && call.seen === null);
const who = (h, res) => signedIn(new Request('https://f/', { headers: h }), 'https://p.supabase.co', async () => res);
const H = { authorization: 'Bearer tok', apikey: 'k' };
check('사용자 토큰 → 통과', await who(H, new Response('{"id":"u1"}')) === true);
check('공개 키를 토큰 자리에 넣음(로그인 서버가 401/403) → 거절', await who(H, new Response('{}', { status: 403 })) === false);
check('토큰 없음 → 거절', await who({ apikey: 'k' }, new Response('{"id":"u1"}')) === false);
check('로그인 서버 응답에 사용자 없음 → 거절', await who(H, new Response('{}')) === false);
const logs = [], w = console.warn; console.warn = (...a) => logs.push(a.join(' ')); await call(ok, new Response('', { status: 404 })); await call(ok, new Error('boom')); console.warn = w;
check('로그에 피드 주소(토큰)가 없음', logs.length === 2 && !logs.join().includes('user_'), logs);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
