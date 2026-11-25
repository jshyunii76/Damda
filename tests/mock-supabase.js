// 시험용 supabase-js 흉내 — 담다가 쓰는 기능만. 사용자는 주소의 ?u=a|b|c (처음 한 번 기억)
(function () {
  const USERS = { a: '상현', b: '우진', c: '관우' };
  let u = new URLSearchParams(location.search).get('u');
  if (u) localStorage.setItem('mockU', u); else u = localStorage.getItem('mockU') || 'a';
  const user = { id: '00000000-0000-0000-0000-00000000000' + u, email: u + '@test', user_metadata: { name: USERS[u] } };
  const sql = async (s, params) => {
    const r = await fetch('/api/sql', { method: 'POST', body: JSON.stringify({ uid: user.id, sql: s, params }) }).then(r => r.json());
    if (r.error) return { data: null, error: r.error };
    return { data: r.rows, error: null, n: r.n };
  };
  const enc = v => (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
  const fix = rows => rows && rows.map(r => { for (const k in r) if (k.endsWith('_at') && r[k]) r[k] = new Date(r[k]).toISOString(); return r; });

  function builder(t) {
    const st = { op: 'select', cols: '*', where: [], params: [], order: [], lim: null, off: null, single: false, ret: null };
    const P = v => { st.params.push(enc(v)); return '$' + st.params.length; };
    const b = {
      select(c) { if (st.op === 'select') st.cols = c || '*'; else st.ret = c || '*'; return b; },
      eq(c, v) { st.where.push(`${c} = ${P(v)}`); return b; },
      gt(c, v) { st.where.push(`${c} > ${P(v)}`); return b; },
      in(c, a) { st.where.push(a.length ? `${c} in (${a.map(P).join(',')})` : 'false'); return b; },
      order(c) { st.order.push(c); return b; },
      range(a, z) { st.off = a; st.lim = z - a + 1; return b; },
      maybeSingle() { st.single = true; return b; },
      upsert(rows, o) { st.op = 'upsert'; st.rows = Array.isArray(rows) ? rows : [rows]; st.conf = o.onConflict; return b; },
      update(v) { st.op = 'update'; st.val = v; return b; },
      delete() { st.op = 'delete'; return b; },
      then(ok, bad) { return run().then(ok, bad); }
    };
    async function run() {
      const W = st.where.length ? ' where ' + st.where.join(' and ') : '';
      if (st.op === 'select') {
        let s = `select ${st.cols} from public.${t}${W}` + (st.order.length ? ' order by ' + st.order.join(',') : '') + (st.lim != null ? ` limit ${st.lim} offset ${st.off}` : '');
        const r = await sql(s, st.params); if (r.error) return r;
        fix(r.data); return { data: st.single ? (r.data[0] || null) : r.data, error: null };
      }
      if (st.op === 'update') {
        const sets = Object.keys(st.val).map(k => `${k} = ${P(st.val[k])}`).join(', ');
        return sql(`update public.${t} set ${sets}${W.replace(/\$(\d+)/g, (m, n) => m)}`, st.params);
      }
      if (st.op === 'delete') return sql(`delete from public.${t}${W}`, st.params);
      // upsert
      const cols = Object.keys(st.rows[0]), conf = st.conf.split(',');
      const vals = st.rows.map(r => '(' + cols.map(c => P(r[c])).join(',') + ')').join(',');
      const upd = cols.filter(c => !conf.includes(c)).map(c => `${c} = excluded.${c}`).join(', ');
      const r = await sql(`insert into public.${t} (${cols.join(',')}) values ${vals} on conflict (${st.conf}) do update set ${upd}` + (st.ret ? ` returning ${st.ret}` : ''), st.params);
      if (r.data) fix(r.data); return r;
    }
    return b;
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user } } }),
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: async () => { localStorage.removeItem('mockU'); return { error: null }; }
    },
    from: builder,
    async rpc(fn, args) {
      const ks = Object.keys(args || {}), ps = ks.map(k => args[k]);
      const r = await sql(`select * from public.${fn}(${ks.map((k, i) => `${k} => $${i + 1}`).join(',')})`, ps);
      if (r.error) return r;
      if (fn === 'create_room' || fn === 'delete_me' || fn === 'my_room_by_code') return { data: r.data[0] && Object.values(r.data[0])[0], error: null };
      return { data: r.data, error: null };
    },
    functions: {
      async invoke(name, { body }) {
        const r = await fetch(`/api/fn/${name}?uid=${user.id}`, { method: 'POST', body: JSON.stringify(body) });
        if (!r.ok) return { data: null, error: { message: 'non-2xx', context: r } };
        return { data: await r.text(), error: null };
      }
    },
    storage: {
      from: () => ({
        async upload(path, blob, o) {
          const r = await fetch(`/api/upload?uid=${user.id}&path=${encodeURIComponent(path)}`, { method: 'POST', body: blob, headers: { 'content-type': (o && o.contentType) || 'application/octet-stream' } }).then(r => r.json());
          return { error: r.error || null };
        },
        async download(path) {
          const r = await fetch(`/api/download?uid=${user.id}&path=${encodeURIComponent(path)}`);
          return r.ok ? { data: await r.blob(), error: null } : { data: null, error: { message: 'not found' } };
        },
        async remove() { return { error: null }; }
      })
    },
    channel() {   // 실시간 흉내: 2초마다 서버 상태가 바뀌었는지 보고 알린다
      const hs = []; let t = null, last = null;
      const ch = {
        on(_, __, fn) { hs.push(fn); return ch; },
        subscribe() { t = setInterval(async () => { try { const v = await fetch('/api/ver').then(r => r.text()); if (last !== null && v !== last) hs.forEach(f => f({})); last = v; } catch (e) {} }, 2000); return ch; },
        _stop() { clearInterval(t); }
      };
      return ch;
    },
    removeChannel(ch) { ch && ch._stop && ch._stop(); }
  };
  window.supabase = { createClient: () => client };
})();
