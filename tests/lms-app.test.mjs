// 2바퀴 시험: 앱의 Canvas 받기(LMS) 시나리오 — index.html 의 실제 코드를 떼어 화면·서버만 흉내 낸다
// (독립 리뷰에서 나온 문제를 하나씩 재현한 것. 괄호 안 #n 은 리뷰 번호)
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('코드를 못 찾음: ' + a); return html.slice(i, j); };
const src = `
const st_=new Map(); const localStorage={getItem:k=>st_.has(k)?st_.get(k):null,setItem(k,v){ if(T.quota&&k.startsWith(T.quota)) throw new Error('quota'); st_.set(k,String(v)); },removeItem:k=>st_.delete(k)};
const T={quota:null,kv:null,busy:false,hopen:false,redraws:0,vis:[]};
const window={}, document={addEventListener:(n,f)=>T.vis.push(f),querySelector:()=>T.busy?{}:null};
const nodes={}; const $=s=>nodes[s]||(nodes[s]={style:{},textContent:'',value:'',replaceChildren(...a){this.kids=a},classList:{remove(){},add(){},contains:()=>T.hopen},click(){},focus(){}});
const el=()=>({style:{}}); const toasts=[]; const toast=t=>toasts.push(t); const schedPush=()=>{}; const navigator={onLine:true,clipboard:{}};
const COLORS=['#1','#2','#3'], INBOX='미분류'; const normalize=()=>{},repin=()=>{},migrateColors=()=>false,drawRooms=()=>{},drawStream=()=>T.redraws++,drawRail=()=>{},roNow=()=>false;
const openRoom=async id=>{ cur=rooms.find(r=>r.id===id); briefOn=false; msgs=await readList(cur); };
const sleep=ms=>new Promise(r=>setTimeout(r,ms>=1000?5:ms)); let selMode=false, noteEd=null, editTarget=null, aiKey=null; const gText=async o=>{ T.asked=(T.asked||0)+1; T.prompt=o.parts[0].text; return T.gtext(o); };
let rooms=[],cur=null,msgs=[],briefOn=true,briefData=null, leaving=false;
const dkey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'), todayKey=()=>dkey(new Date());
const pending=m=>!!m.due&&!m.done, dueOf=m=>m.due, isRep=()=>false, ddays=d=>Math.round((new Date(d)-new Date(todayKey()))/864e5);
const key=r=>r.code?'room:'+r.code:'msgs:'+r.id, isRO=r=>!!(r&&r.code&&r.joined&&r._perm==='view');
const RS={marks:[],mark(r){RS.marks.push(r.code)},keepFresh:(c,l)=>l,seen(){},start(){}};
` + cut('const mem={};', '/* ---------- 상태') + cut('const SYNC_ON=', 'let seqN=').replace('!!(SB_URL&&SB_KEY)', 'true')
  + 'let seqN=1;' + cut('function syncMark', 'function fileMark') + cut('function applyRows', 'async function pull()')
  + `async function pull(){ if(T.offline) throw new Error('offline'); if(!T.kv) return false; const r=T.kv; T.kv=null; return applyRows(r).changed; }\n`
  + cut('async function loadRooms', '/* 방 아이콘 색') + cut('/*LMS-PURE-START', "$('#toLms').onclick")
  + cut('async function buildBrief', 'async function openBrief')
  + `async function openBrief(){ briefOn=true;cur=null;msgs=[]; briefData=await buildBrief(); }
const drawBrief=()=>{},celebrateTask=()=>{},md=x=>x,nextRep=()=>null, close=()=>{}, persist=async()=>saveList(cur,msgs);`
  + cut('async function completeHomeTask', '/* ---------- 작성')
  + cut('async function saveEdit', '  /* 바뀐 내용으로 태그').replace(/$/, '\n}\n')
  + `
return {LMS,LMSP,S,T,localStorage,merge3,hs,applyRows,setBase,completeHomeTask,saveEdit,openBrief,openRoom,toasts,RS,nodes,readList,saveList,
 get base(){return base},get pend(){return pend},get rooms(){return rooms},set rooms(v){rooms=v},get cur(){return cur},get msgs(){return msgs},set msgs(v){msgs=v},get briefData(){return briefData},
 set edit(m){editTarget=m}, set aiKey(v){aiKey=v},set leaving(v){leaving=v},logout(){ me=null; },load:loadRooms,
 login(f,id='u'){ me={id}; SB={functions:{invoke:async(n,o)=>f(o.body.url)}}; lsSet(OWNER,id); }};`;
const mk = () => new Function('console', src)({ warn() {}, error() {}, log() {} });
const p = n => String(n).padStart(2, '0');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; };
const dash = s => s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6);
const ics = (...e) => 'BEGIN:VCALENDAR\n' + e.map(x => `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${x.d}T000000\nSUMMARY:${x.t || 'T'} [26_${x.c || '과목'}]\nUID:event-assignment-${x.u}\nURL;VALUE=URI:https://x.ac.kr/calendar?include_contexts=course_${x.cid || 1}&m=1#a\nEND:VEVENT\n`).join('') + 'END:VCALENDAR\n';
const URL_ = 'https://x.ac.kr/feeds/calendars/user_FAKEFAKEFAKE.ics', tick = async (n = 8) => { for (let i = 0; i < n; i++) await 0; }, wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '  → ' + JSON.stringify(d))); };
const T = async (n, f) => { try { await f(); } catch (e) { check(n + ' (시험 중 오류)', false, e.stack); } };
// 준비된 앱: feed 를 바꿔 가며 받는다
async function app(feed, o = {}) {
  const a = mk(); a.feed = feed; a.login(() => a.gate ? a.gate.then(() => ({ data: a.feed })) : a.err ? { error: { context: { json: async () => ({ error: a.err }) } } } : { data: a.feed });
  await a.S.set('rooms', o.rooms || []); for (const k in o.msgs || {}) await a.S.set(k, o.msgs[k], k.startsWith('room:'));
  if (o.lms !== null) await a.S.set('lms', o.lms || { url: URL_ });
  await a.load(); await a.openBrief(); if (!o.noStart) { const hold = a.gate; a.T.busyStart = 1; a.LMS.start(); await wait(5); }
  a.texts = async () => { const out = []; for (const r of a.rooms) for (const m of await a.readList(r)) out.push(r.name + ':' + m.text + '@' + m.due); return out; };
  return a;
}
console.log('앱에서 받기');

await T('준비 전', async () => {
  const a = mk(); a.login(() => ({ data: ics({ u: 1, d: day(3) }) })); const srv = [{ id: 'rA', name: 'A' }, { id: 'rB', name: 'B' }];
  a.localStorage.setItem('p:rooms', JSON.stringify(srv)); a.setBase('p:rooms', 't', srv); a.localStorage.setItem('p:lms', JSON.stringify({ url: URL_ }));
  const n = a.T.vis.length; await a.LMS.pull(false); await a.LMS.pull(true);
  check('앱이 준비되기 전에는 받지 않음, 방 목록 그대로 (#1)', JSON.parse(a.localStorage.getItem('p:rooms')).length === 2 && n === 0, a.localStorage.getItem('p:rooms'));
  await a.load(); await a.openBrief(); a.LMS.start(); await wait(5);
  check('준비된 뒤 받으면 기존 방 + 과목방', a.rooms.map(r => r.name).sort().join() === 'A,B,과목', a.rooms.map(r => r.name));
  check('서버와 합쳐도 방이 안 사라짐', a.merge3('p:rooms', a.base['p:rooms'].h, JSON.parse(a.localStorage.getItem('p:rooms')), srv).length === 3);
});
await T('기본', async () => {
  const a = await app(ics({ u: 1, d: day(3), t: '가' }, { u: 2, d: day(4), t: '나', cid: 2, c: '둘' }));
  check('처음 받기: 과목방 2개', (await a.texts()).length === 2 && a.rooms.length === 2, await a.texts());
  let r = await a.LMS.pull(true); check('다시 받기: 중복 없음', r.added === 0 && (await a.texts()).length === 2);
  r = await a.LMS.pull(false); check('1시간 안에는 자동으로 안 받음', r === null);
  const room = a.rooms.find(x => x.name === '둘'); await a.saveList(room, []); r = await a.LMS.pull(true);
  check('내가 지운 일정은 되살리지 않음', r.added === 0 && (await a.texts()).length === 1, await a.texts());
  room.name = '바꾼이름'; a.feed = ics({ u: 1, d: day(3), t: '가' }, { u: 2, d: day(4), t: '나', cid: 2, c: '둘' }, { u: 3, d: day(5), t: '다', cid: 2, c: '둘' }); await a.LMS.pull(true);
  check('방 이름을 바꿔도 같은 방에', (await a.texts()).some(x => x.startsWith('바꾼이름:[과제] 다')) && a.rooms.length === 2, await a.texts());
  check('메모를 다른 개인방으로 옮겨도 중복 없음', await (async () => { const g = a.rooms.find(x => x.name === '과목'), l = await a.readList(g); await a.saveList(g, []); await a.saveList(room, [...await a.readList(room), ...l]); return (await a.LMS.pull(true)).added === 0; })());
});
await T('두 기기', async () => {
  const f = ics({ u: 1, d: day(3), t: '가' }), a = await app(f), b = await app(f);
  check('두 기기가 따로 받아도 방·메모 ID가 같음', a.rooms[0].id === b.rooms[0].id && (await a.readList(a.rooms[0]))[0].id === (await b.readList(b.rooms[0]))[0].id);
  const K = 'p:msgs:_lms', m = a.merge3(K, {}, JSON.parse(a.localStorage.getItem(K)), [{ id: 'x.ac.kr event-assignment-77', ts: 1 }]);
  check('담은 적 있는 일정 기록은 두 기기 것이 합쳐짐', m.length === 2, m);
});
await T('#3', async () => {
  const f = ics({ u: 1, d: day(3) }, { u: 2, d: day(4), t: 'A가지움' }), a = await app(f, { noStart: true, msgs: { 'msgs:_lms': [{ id: 'x.ac.kr event-assignment-1' }] } });
  for (const k in a.pend) delete a.pend[k];
  a.T.kv = [{ k: 'p:msgs:_lms', v: [{ id: 'x.ac.kr event-assignment-1' }, { id: 'x.ac.kr event-assignment-2' }], updated_at: '9' }];   // 다른 기기가 담았다가 지운 것
  a.LMS.start(); await wait(10); check('다른 기기에서 지운 과제가 되살아나지 않음 (#3)', (await a.texts()).length === 0, await a.texts());
});
await T('#4', async () => {
  const a = await app('', { noStart: true }); a.err = 'net'; for (const k in a.pend) delete a.pend[k];
  a.LMS.start(); await wait(10);
  check('받기에 실패해도 연결 정보를 다시 올리지 않음 (#4)', !('p:lms' in a.pend), a.pend);
  a.applyRows([{ k: 'p:lms', deleted: true, updated_at: '9' }]); check('다른 기기에서 끊은 연결이 되살아나지 않음 (#4)', a.localStorage.getItem('p:lms') === null);
  check('실패해도 받은 시각이 생기지 않음', !JSON.parse(a.localStorage.getItem('damda:lms')).at);
});
await T('#4b', async () => {
  const a = await app(ics({ u: 1, d: day(3) }), { noStart: true }); for (const k in a.pend) delete a.pend[k];
  a.T.kv = [{ k: 'p:lms', deleted: true, updated_at: '9' }]; a.LMS.start(); await wait(10);
  check('받는 동안 다른 기기에서 끊었으면 담지 않음', (await a.texts()).length === 0);
});
await T('#2', async () => {
  const mk1 = (f) => { const x = mk(); const e = x.LMSP.parse(f)[0]; e.host = 'x.ac.kr'; return x.LMSP.make(e, 1); };
  const S1 = { rooms: [{ id: 'rS', name: '공유', code: 'ABCDEF', rid: 'x', joined: true }] }, A1 = mk1(ics({ u: 1, d: day(3), t: 'A의과제' }));
  let a = await app(ics({ u: 99, d: day(3), cid: 9, c: 'B과목' }), { ...S1, msgs: { 'room:ABCDEF': { perm: 'edit', messages: [A1] } } });
  check('남의 과제에 (사라짐)이 안 붙고 공유방을 안 고침 (#2a)', (await a.texts()).includes('공유:[과제] A의과제@' + dash(day(3))) && !a.RS.marks.length, await a.texts());
  a = await app(ics({ u: 1, d: day(9), t: 'A의과제' }), { ...S1, msgs: { 'room:ABCDEF': { perm: 'edit', messages: [A1] } } });
  check('내 마감으로 공유 메모를 덮지 않음 (#2b)', (await a.texts()).includes('공유:[과제] A의과제@' + dash(day(3))), await a.texts());
  check('공유 메모가 있어도 내 할 일은 따로 생김 (#2c)', (await a.texts()).includes('과목:[과제] A의과제@' + dash(day(9))), await a.texts());
  a = await app(ics({ u: 1, d: day(3), t: '개인' })); const r = a.rooms[0], l = await a.readList(r); r.code = 'ZZZZZZ'; r.rid = 'y'; await a.S.set('room:ZZZZZZ', { messages: l, perm: 'edit' }, true); await a.S.set('rooms', a.rooms); await a.load(); a.RS.marks.length = 0;
  a.feed = ics({ u: 1, d: day(3), t: '개인' }, { u: 2, d: day(5), t: '새개인과제' }); await a.LMS.pull(true);
  const sh = await a.readList(a.rooms.find(x => x.code)); check('과목방을 공유해도 새 과제는 공유방에 안 올라감 (#2d)', sh.length === 1 && !a.RS.marks.length, sh.map(m => m.text));
  check('새 과제는 새 개인방으로, 방 ID 안 겹침', (await a.texts()).some(x => x.includes('새개인과제')) && new Set(a.rooms.map(x => x.id)).size === a.rooms.length, a.rooms);
});
await T('#5', async () => {
  const a = await app(ics({ u: 1, d: day(3), t: '기존' })); await a.openBrief(); const x = a.briefData.all[0], m = x.list[0];
  a.feed = ics({ u: 1, d: day(3), t: '기존' }, { u: 2, d: day(4), t: '새과제' }); await a.LMS.pull(true);
  await a.completeHomeTask({ stopPropagation() {} }, { getBoundingClientRect: () => ({}) }, x.r, x.list, m);
  const l = await a.readList(a.rooms[0]); check('옛 화면에서 완료를 눌러도 새 과제가 안 사라짐 (#5)', l.length === 2 && l.find(q => q.id === m.id).done === true && !l.find(q => q.id !== m.id).done, l);
});
await T('#6', async () => {
  const a = await app(ics({ u: 1, d: day(-1), t: '지난' })); check('지난 과제는 안 담음', (await a.texts()).length === 0);
  a.feed = ics({ u: 1, d: day(7), t: '지난' }); check('마감이 미뤄지면 담음 (#6)', (await a.LMS.pull(true)).added === 1);
});
await T('옛 버전', async () => {
  const a = await app(ics({ u: 1, d: day(3), t: '지웠음' }, { u: 2, d: day(-2), t: '지난' }, { u: 3, d: day(4), t: '새것' }), { lms: { url: URL_, at: 1, seen: ['event-assignment-1', 'event-assignment-2'], courses: 3 } });
  check('옛 기록 옮김: 지운 것 안 살아나고 새것만 담음', (await a.texts()).join() === '과목:[과제] 새것@' + dash(day(4)), await a.texts());
  check('옮긴 뒤 p:lms 에는 주소만', a.localStorage.getItem('p:lms') === JSON.stringify({ url: URL_ }));
  a.feed = ics({ u: 2, d: day(5), t: '지난' }); check('옛 기록의 지난 과제도 미뤄지면 담음', (await a.LMS.pull(true)).added === 1);
});
await T('옛 메모', async () => {
  const x = mk(), e = x.LMSP.parse(ics({ u: 1, d: day(3), t: '가' }))[0]; e.host = 'x.ac.kr'; const m = x.LMSP.make(e, 1); delete m.lms.host; m.id = 'cOLD';
  const a = await app(ics({ u: 1, d: day(6), t: '가' }, { u: 2, d: day(3), t: '나' }), { rooms: [{ id: 'rlmsOLD', name: '과목', lms: 'course_1' }], msgs: { 'msgs:rlmsOLD': [m] }, lms: { url: URL_, seen: ['event-assignment-1'] } });
  const t = await a.texts(); check('지금 폰에 담긴 옛 메모·방을 그대로 이어 씀', a.rooms.length === 1 && t.length === 2 && t.includes('과목:[과제] 가@' + dash(day(6))), t);
});
await T('#7', async () => {
  for (const [n, f] of [['로그아웃', a => { a.leaving = true; }], ['다른 계정', a => a.login(() => ({ data: '' }), 'other')], ['로그인 풀림', a => a.logout()]]) {
    const a = await app(ics({ u: 1, d: day(3) }), { noStart: true, rooms: [{ id: 'rP', name: '사적인방' }] }); let go; a.gate = new Promise(r => go = r); a.LMS.start(); await tick();
    f(a); for (const k of ['p:rooms', 'p:lms', 'p:msgs:_lms']) a.localStorage.removeItem(k); go(); await wait(10);
    check(`받는 중 ${n} → 아무것도 저장 안 함 (#7)`, a.localStorage.getItem('p:rooms') === null && a.localStorage.getItem('p:msgs:_lms') === null && a.localStorage.getItem('p:lms') === null, a.localStorage.getItem('p:rooms'));
  }
});
await T('#8', async () => {
  const a = await app(ics({ u: 1, d: day(3) }), { noStart: true }); let go; a.gate = new Promise(r => go = r); a.LMS.start(); await tick(); await a.LMS.cut(); go(); await wait(10);
  check('받는 중 연결을 끊으면 담지 않음 (#8)', (await a.texts()).length === 0 && a.localStorage.getItem('p:lms') === null);
  const b = await app(ics({ u: 1, d: day(3) }), { noStart: true }); let go2; b.gate = new Promise(r => go2 = r); b.LMS.start(); await tick();
  const l = b.LMS.link(URL_.replace('FAKE', 'NEW0')); await tick(); go2(); await l; check('받는 중 다시 연결하면 새 주소로 연결됨 (#8)', JSON.parse(b.localStorage.getItem('p:lms')).url.includes('NEW0') && (await b.texts()).length === 1, b.toasts);
});
await T('연결', async () => {
  const a = await app('', { lms: null }); a.err = 'feed'; await a.LMS.link(URL_);
  check('안 받아지는 주소는 저장하지 않음', a.localStorage.getItem('p:lms') === null && /다시 복사/.test(a.toasts.at(-1)), a.toasts);
  await a.LMS.link('https://evil.com/x'); check('이상한 주소 안내', /피드 주소가 아니/.test(a.toasts.at(-1)));
  a.err = null; a.feed = ics({ u: 1, d: day(3) }); await a.LMS.link(URL_); check('연결하면 바로 담음', (await a.texts()).length === 1);
  await a.saveList(a.rooms[0], []); await a.LMS.cut(); check('끊으면 주소가 기기에서 사라짐', ![...['p:lms', 'damda:lms']].some(k => a.localStorage.getItem(k)));
  await a.LMS.link(URL_); check('끊었다 다시 연결해도 지운 일정 안 살아남', (await a.texts()).length === 0);
});
await T('#9', async () => {
  const a = await app(ics({ u: 1, d: day(3), c: 'A대과목', t: 'A대과제' }, { u: 7, d: day(3), c: 'A대과목', t: 'A대과제7' })); await a.LMS.cut();
  a.feed = ics({ u: 1, d: day(9), c: 'B대과목', t: 'B대과제' }); await a.LMS.link(URL_.replace('x.ac', 'y.ac')); const t = await a.texts();
  check('다른 학교로 바꿔도 안 섞임 (#9)', t.length === 3 && t.includes('A대과목:[과제] A대과제@' + dash(day(3))) && t.includes('A대과목:[과제] A대과제7@' + dash(day(3))) && t.includes('B대과목:[과제] B대과제@' + dash(day(9))), t);
});
await T('#10', async () => {
  const a = await app(ics({ u: 1, d: day(3), t: '가' })); await a.openRoom(a.rooms[0].id); const old = a.msgs[0]; a.edit = old;
  a.feed = ics({ u: 1, d: day(3), t: '가' }, { u: 2, d: day(4), t: '나' }); await a.LMS.pull(true); a.nodes['#editTxt'] = { value: '내가 고침' }; await a.saveEdit();
  const l = await a.readList(a.rooms[0]); check('받는 중에 열어 둔 수정이 저장됨 (#10)', l.length === 2 && l.some(m => m.text === '내가 고침'), l.map(m => m.text));
  const b = await app(ics({ u: 1, d: day(3) }), { noStart: true }); b.T.busy = true; b.LMS.start(); await wait(30); const during = (await b.texts()).length; b.T.busy = false; await wait(40);
  check('창이 열려 있으면 자동 받기는 기다렸다가 담음 (#10)', during === 0 && (await b.texts()).length === 1, [during, await b.texts()]);
});
await T('#11', async () => {
  const a = await app(ics({ u: 1, d: day(3), t: '팀 프로젝트' })); const r = a.rooms[0]; let l = await a.readList(r); await a.saveList(r, l.map(m => ({ ...m, note: '비밀 메모', pin: true, tags: ['x'] }))); l = await a.readList(r);
  await a.LMS.teamRoom(l[0], r); const t = a.rooms.find(x => x.lmsTeam), c = (await a.readList(t))[0];
  check('팀플방에 개인 메모·고정·태그가 안 넘어감 (#11)', !c.note && !c.pin && !c.tags && !c.lms && c.due === l[0].due, c);
  await a.openBrief(); a.feed = ics({ u: 1, d: day(8), t: '팀 프로젝트' }); await a.LMS.pull(true); check('팀플방 마감도 같이 바뀜 (#11)', (await a.readList(t))[0].due === dash(day(8)));
  await a.saveList(t, [{ ...(await a.readList(t))[0], due: dash(day(2)) }]); a.feed = ics({ u: 1, d: day(10), t: '팀 프로젝트' }); await a.LMS.pull(true); check('팀이 따로 정한 마감은 그대로', (await a.readList(t))[0].due === dash(day(2)));
  const n = a.rooms.length; await a.LMS.teamRoom((await a.readList(r))[0], r); check('다시 눌러도 팀플방은 하나', a.rooms.length === n);
});
await T('#12', async () => {
  const a = await app(ics({ u: 1, d: day(3) }), { noStart: true }); a.T.quota = 'p:msgs:r'; a.LMS.start(); await wait(10);
  check('저장 공간 부족을 알림 (#12)', /저장 공간/.test(a.toasts.join()) && !/담았어요/.test(a.toasts.join()), a.toasts); a.T.quota = null;
  check('공간이 생기면 다시 담음 (#12)', (await a.LMS.pull(true)).added === 1);
});
await T('#14', async () => {
  const a = await app(ics({ u: 1, d: day(3), cid: 1, c: '캡스톤', t: '하나' }, { u: 2, d: day(4), cid: 2, c: '캡스톤', t: '둘' })); check('이름 같은 두 과목이 안 섞임 (#14)', a.rooms.length === 2 && a.rooms.every(r => r.lms), a.rooms);
  const b = await app(ics({ u: 1, d: day(3), c: '과목[가반]', t: '하나' })); check('과목 이름 안에 대괄호가 있어도 읽음 (#14)', b.rooms[0].name === '과목[가반]', b.rooms[0].name);
  const c = await app(ics({ u: 1, d: day(3), c: '내방', t: '하나' }), { rooms: [{ id: 'rM', name: '내방' }] }); check('내가 만들어 둔 같은 이름 방을 씀', c.rooms.length === 1 && c.rooms[0].id === 'rM');
});
await T('그 밖', async () => {
  const a = await app(ics({ u: 1, d: day(3) }), { noStart: true }); let go; a.gate = new Promise(r => go = r); a.LMS.start(); await tick(); await a.LMS.pull(true); check('받는 중에 또 누르면 안내', /받는 중/.test(a.toasts.join())); go(); await wait(10);
  const b = await app('BEGIN:VCALENDAR\nEND:VCALENDAR\n', { noStart: true, rooms: [{ id: 'r1', name: '방' }] }); b.LMS.start(); await wait(5); check('빈 피드도 문제없음', b.rooms.length === 1);
});

await T('AI 요약', async () => {
  const ev = (u, d, t, desc) => `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${d}T000000\nSUMMARY:${t} [26_봉사]\n` + (desc ? `DESCRIPTION:${desc}\n` : '') + `UID:event-assignment-${u}\nURL;VALUE=URI:https://x.ac.kr/calendar?include_contexts=course_1#a\nEND:VEVENT\n`;
  const f = 'BEGIN:VCALENDAR\n' + ev(1, day(5), '사랑의 실천과제2', '2차 과제입니다.\\n1차를 제출한 사람은 내지 않아도 됩니다.') + ev(2, day(6), '설명없음', '') + 'END:VCALENDAR\n';
  const a = await app(f); check('AI 키가 없으면 요약 안 함', !a.T.asked);
  a.aiKey = 'k'; a.T.gtext = async () => '["1차 제출자는 안 내도 됨"]'; await a.LMS.pull(true); await wait(20);
  const m = (await a.readList(a.rooms[0])).find(x => x.lms.uid.endsWith('-1'));
  check('설명 있는 과제만 AI에 보냄, 요약이 둘째 줄에', a.T.asked === 1 && !a.T.prompt.includes('설명없음') && a.T.prompt.includes('1차를 제출한') && m.text === '[과제] 사랑의 실천과제2\n💡 1차 제출자는 안 내도 됨', [a.T.asked, m.text]);
  await a.LMS.pull(true); await wait(20); check('같은 설명은 다시 요약 안 함', a.T.asked === 1);
  a.T.gtext = async () => 'JSON 아님'; a.feed = a.feed.replace('내지 않아도', '꼭 내야'); await a.LMS.pull(true); await wait(20);
  check('AI 답이 이상해도 과제는 그대로', (await a.readList(a.rooms[0])).length === 2 && a.T.asked === 2);
  a.T.gtext = async () => { throw new Error('quota'); }; a.feed = a.feed.replace('꼭 내야', '다시'); const r = await a.LMS.pull(true); await wait(20);
  check('AI 오류가 나도 받기는 성공', r && (await a.readList(a.rooms[0])).length === 2);
});
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
