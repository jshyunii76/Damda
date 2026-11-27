-- 담다 AI (키 없이 쓰기) 하루 사용량. Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run (여러 번 실행해도 안전)
-- 서버 함수(functions/ai)가 Gemini 를 부르기 전에 ai_take 로 한 번씩 센다.
-- 사람마다, 한국 날짜 기준 하루: 글 만들기(gen) 60번, 검색용 벡터(emb) 600번.

create schema if not exists private;
create table if not exists private.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  kind    text not null,
  n       int  not null default 0,
  primary key (user_id, day, kind)
);
alter table private.ai_usage enable row level security;   -- 정책 없음 = 함수(ai_take) 말고는 아무도 못 읽고 못 씀
revoke all on private.ai_usage from anon, authenticated;

-- 한 번 쓸 때마다 1 늘리고, 남은 횟수를 돌려준다. 한도를 넘으면 -1
create or replace function public.ai_take(p_kind text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_max int;
  v_n   int;
begin
  if v_uid is null then raise exception 'login required'; end if;
  v_max := case p_kind when 'gen' then 60 when 'emb' then 600 end;
  if v_max is null then raise exception 'bad kind'; end if;
  insert into private.ai_usage as u (user_id, day, kind, n) values (v_uid, v_day, p_kind, 1)
  on conflict (user_id, day, kind) do update set n = u.n + 1
  returning n into v_n;
  delete from private.ai_usage where user_id = v_uid and day < v_day - 7;   -- 지난 기록은 1주일만
  if v_n > v_max then return -1; end if;
  return v_max - v_n;
end $$;
revoke all on function public.ai_take(text) from public, anon;
grant execute on function public.ai_take(text) to authenticated;
