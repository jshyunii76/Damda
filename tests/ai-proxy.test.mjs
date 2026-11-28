// 담다 AI 서버 함수(functions/ai) 시험: 허용 주소·로그인·한도·키 없음·Gemini 로 넘기는 내용
import { handle, kindOf, take, clean } from '../supabase/functions/ai/index.ts';

let pass = 0, fail = 0;
const check = (name, ok, info) => { ok ? pass++ : fail++; console.log((ok ? '✅ ' : '❌ ') + name + (ok ? '' : '  ' + JSON.stringify(info))); };
const req = (body, h = {}) => new Request('http://f/', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { origin: 'https://pikachu515.github.io', ...h } });
let counted = 0;
const GEN = { path: 'models/gemini-2.5-flash:generateContent', body: { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] } };

check('글 만들기 주소 허용', kindOf('models/gemini-3.5-flash-lite:generateContent')?.kind === 'gen');
check('벡터 주소 허용', kindOf('models/gemini-embedding-001:embedContent')?.kind === 'emb');
check('목록에 없는 비싼 모델 거절 (pro·image·tts)', ['gemini-2.5-pro', 'gemini-2.5-flash-image', 'gemini-2.5-flash-preview-tts'].every(m => kindOf('models/' + m + ':generateContent') === null));
check('글 모델로 벡터 동작 거절', kindOf('models/gemini-2.5-flash:embedContent') === null);
check('다른 동작 거절 (스트리밍·배치 등)', kindOf('models/gemini-2.5-flash:streamGenerateContent') === null && kindOf('models/gemini-embedding-001:batchEmbedContents') === null);
check('경로 바꾸기 거절', kindOf('models/../files:generateContent') === null && kindOf('../v1/models/gemini-2.5-flash:generateContent') === null);
check('다른 주소 섞기 거절', kindOf('models/gemini-2.5-flash:generateContent?key=x') === null && kindOf('https://evil/models/gemini-2.5-flash:generateContent') === null);

/* clean: 앱이 보내는 항목만 남긴다 */
let c = clean('gen', 'gemini-2.5-flash', { contents: [{ role: 'user', parts: [{ text: 'hi' }] }], tools: [{ google_search: {} }], cachedContent: 'x', safetySettings: [],
  generationConfig: { maxOutputTokens: 65536, temperature: 9, thinkingConfig: { thinkingBudget: 32768 }, responseMimeType: 'application/json' }, systemInstruction: { parts: [{ text: 'sys' }] } });
check('검색 도구·캐시·안전 설정은 버림', c && !c.tools && !c.cachedContent && !c.safetySettings, c);
check('출력 길이는 2048까지, 생각 설정은 버림', c.generationConfig.maxOutputTokens === 2048 && !c.generationConfig.thinkingConfig && c.generationConfig.temperature === 1.2, c.generationConfig);
check('JSON 답·시스템 지시는 남김', c.generationConfig.responseMimeType === 'application/json' && c.systemInstruction.parts[0].text === 'sys');
const img = { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } };
check('사진 4장까지', !!clean('gen', 'm', { contents: [{ role: 'user', parts: [img, img, img, img, { text: 'x' }] }] }) && clean('gen', 'm', { contents: [{ role: 'user', parts: [img, img, img, img, img] }] }) === null);
check('사진 합계 4MB 넘으면 거절', clean('gen', 'm', { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'A'.repeat(4 * 1024 * 1024 + 1) } }] }] }) === null);
check('사진 말고 다른 파일 거절 (영상·fileData)', clean('gen', 'm', { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'video/mp4', data: 'A' } }] }] }) === null
  && clean('gen', 'm', { contents: [{ role: 'user', parts: [{ fileData: { fileUri: 'x' } }] }] }) === null);
check('글이 너무 길면 거절', clean('gen', 'm', { contents: [{ role: 'user', parts: [{ text: 'x'.repeat(30001) }] }] }) === null);
c = clean('emb', 'gemini-embedding-001', { model: 'models/other', content: { parts: [{ text: 'hi' }] }, outputDimensionality: 256, taskType: 'X' });
check('벡터: 모델은 서버가 정함, 필요한 것만', c.model === 'models/gemini-embedding-001' && c.outputDimensionality === 256 && !c.taskType, c);

let sent = null;
const gem = async (url, o) => { sent = { url, o }; return new Response('{"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}', { status: 200 }); };
let r = await handle(req(GEN), { fetcher: gem, key: 'K', count: async () => 10 });
check('정상: 200 + Gemini 답 그대로', r.status === 200 && (await r.json()).candidates?.length === 1);
check('Gemini 로 보낸 본문은 다시 만든 것', JSON.parse(sent.o.body).contents[0].parts[0].text === 'hi');
check('Gemini 로 키를 머리에 실어 보냄 (주소엔 없음)', sent.o.headers['x-goog-api-key'] === 'K' && !sent.url.includes('K'), sent.url);
check('Gemini 주소 = 기본 주소 + 경로', sent.url === 'https://generativelanguage.googleapis.com/v1beta/' + GEN.path);
check('CORS: 담다 주소 허용', r.headers.get('access-control-allow-origin') === 'https://pikachu515.github.io');

sent = null;
r = await handle(req(GEN), { fetcher: gem, key: '', count: async () => 10 });
check('키 없음 → 503 nokey (Gemini 안 부름)', r.status === 503 && (await r.json()).error === 'nokey' && !sent);
r = await handle(req(GEN), { fetcher: gem, key: 'K', count: async () => null });
check('로그인 아님 → 401 (Gemini 안 부름)', r.status === 401 && !sent);
r = await handle(req(GEN), { fetcher: gem, key: 'K', count: async () => -1 });
check('한도 넘음 → 429 limit (Gemini 안 부름)', r.status === 429 && (await r.json()).error === 'limit' && !sent);
r = await handle(req({ ...GEN, path: 'files' }), { fetcher: gem, key: 'K', count: async () => 10 });
check('허용 안 된 경로 → 400', r.status === 400 && !sent);
r = await handle(req({ ...GEN, path: 'models/gemini-2.5-pro:generateContent' }), { fetcher: gem, key: 'K', count: async () => { counted++; return 10; } });
check('비싼 모델 → 400, 한도도 안 씀', r.status === 400 && !sent);
r = await handle(req({ path: GEN.path, body: null }), { fetcher: gem, key: 'K', count: async () => { counted++; return 10; } });
check('본문 없음 → 400, 한도도 안 씀', r.status === 400 && counted === 0);
r = await handle(req('x'.repeat(6 * 1024 * 1024 + 1)), { fetcher: gem, key: 'K', count: async () => 10 });
check('6MB 넘으면 413', r.status === 413 && !sent);
r = await handle(new Request('http://f/', { method: 'GET' }), { fetcher: gem, key: 'K' });
check('GET 거절', r.status === 405);
r = await handle(req(GEN), { fetcher: async () => { throw new Error('down'); }, key: 'K', count: async () => 10 });
check('Gemini 연결 실패 → 502', r.status === 502);
r = await handle(req(GEN), { fetcher: async () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 }), key: 'K', count: async () => 10 });
check('Gemini 쪽 한도·키 문제(429) → 502 upstream (구글 문구 안 보임)', r.status === 502 && (await r.json()).error === 'upstream');
r = await handle(req(GEN), { fetcher: async () => new Response('{"error":{"status":"INVALID_ARGUMENT"}}', { status: 400 }), key: 'K', count: async () => 10 });
check('그 밖의 Gemini 오류는 상태 그대로', r.status === 400);

/* take: 로그인 토큰으로 ai_take 를 부른다 */
let call = null;
const rest = async (url, o) => { call = { url, o }; return new Response('42', { status: 200 }); };
let n = await take(req(GEN, { authorization: 'Bearer T', apikey: 'P' }), 'gen', 'https://x.supabase.co', rest);
check('take: ai_take 호출 + 남은 횟수', n === 42 && call.url === 'https://x.supabase.co/rest/v1/rpc/ai_take' && JSON.parse(call.o.body).p_kind === 'gen' && call.o.headers.Authorization === 'Bearer T');
n = await take(req(GEN), 'gen', 'https://x.supabase.co', rest);
check('take: 토큰 없으면 null', n === null);
n = await take(req(GEN, { authorization: 'Bearer T', apikey: 'P' }), 'gen', 'https://x.supabase.co', async () => new Response('{}', { status: 401 }));
check('take: 서버가 거절하면 null', n === null);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
