// 5바퀴 시험: AI 팀플 매니저의 계산 부분 (AI 없이도 도는 기본 계획표·대화에서 할 일 찾기)
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('못 찾음 ' + a); return html.slice(i, j); };
const dkey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = (k, n) => { const d = new Date(k + 'T00:00'); d.setDate(d.getDate() + n); return dkey(d); };
const template = new Function('addDays', grab('  function template(today,last){', '  /* 역할 → 사람') + '; return template;')(addDays);
const fromTalk = new Function(grab('  function fromTalk(log,names){', '  function preview(o){') + '; return fromTalk;')();

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '  → ' + JSON.stringify(d))); };

console.log('기본 계획표');
const today = '2026-11-27';
let bad = [];
for (let span = 0; span <= 60; span++) {
  const last = addDays(today, span), t = template(today, last);
  const ok = t.length === 6 && t.every((x, i) => x.due >= today && x.due <= last && (i === 0 || x.due >= t[i - 1].due)) && t[5].due === last;
  if (!ok) bad.push([span, t.map(x => x.due)]);
}
check('마감까지 0~60일 모두: 순서 안 뒤집힘, 오늘~마감 사이, 마지막은 마감일', bad.length === 0, bad.slice(0, 3));
const t14 = template(today, addDays(today, 14));
check('2주 과제: 초안 D-7, 검토 D-3', t14[2].due === addDays(today, 7) && t14[4].due === addDays(today, 11), t14.map(x => x.due));
const t5 = template(today, addDays(today, 5));
check('5일 과제(리뷰 재현): 초안이 검토보다 먼저', t5[2].due <= t5[4].due, t5.map(x => x.due));

console.log('대화에서 할 일 찾기');
const L = (n, s) => ({ n, s });
let r = fromTalk([L('상현', '오늘 주제는 카페 컵 문제로 가자'), L('상현', '우진이 설문지 만들어줘'), L('우진', '좋아 설문지는 내가 할게'),
  L('우진', '인터뷰 대상 섭외도 내가 맡을게'), L('관우', '그럼 나는 PPT 할게요'), L('상현', '관우야 발표 대본도 맡아줘'), L('우진', '자료 정리는 제가 하겠습니다')], ['상현', '우진', '관우']);
check('결정 찾기', r.decisions.join() === '오늘 주제는 카페 컵 문제', r.decisions);
check('할 일·담당 (부탁과 대답은 하나로)', JSON.stringify(r.tasks.map(x => x.t + '>' + x.who)) === JSON.stringify(['설문지 만들기>우진', '인터뷰 대상 섭외>우진', 'PPT>관우', '발표 대본>관우', '자료 정리>우진']), r.tasks);
let err = null; try { r = fromTalk([L('김(팀장', '박[부팀장] 자료 맡아줘'), L('박[부팀장]', '네 할게요')], ['김(팀장', '박[부팀장]']); } catch (e) { err = e.message; }
check('이름에 괄호가 있어도 오류 없음 (리뷰 #12)', !err && r.tasks.length >= 1, err || r.tasks);
r = fromTalk([L('상현', '가방 정리 내가 할게')], ['상현', '가']);
check('한 글자 이름은 아무 문장에나 걸리지 않음', r.tasks[0] && r.tasks[0].who === '상현', r.tasks);
check('할 일 없는 대화', fromTalk([L('상현', '안녕')], ['상현']).tasks.length === 0);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
