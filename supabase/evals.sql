-- Damda 동료 평가 (5바퀴) — rooms.sql 다음에 SQL Editor 에서 Run (여러 번 실행해도 안전)
-- 방 멤버가 자기 자신과 팀원의 기여를 '균등 몫 = 100점' 기준으로 매긴다.
--   · 내가 준 점수는 나만 본다 (누가 누구에게 몇 점 줬는지는 비공개)
--   · 방 멤버는 사람별 합계만 본다: 본인 주장(claimed) · 팀원이 본 기여(perceived) · 평가한 팀원 수
-- 방식 참고: TEAMMATES 기여도 질문(claimed/perceived 비교) — 코드는 가져오지 않음

create table if not exists public.room_evals (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  rater      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ratee      uuid not null references auth.users(id) on delete cascade,
  points     int  not null check (points between 0 and 1000),
  updated_at timestamptz not null default now(),
  primary key (room_id, rater, ratee)
);
alter table public.room_evals enable row level security;
revoke all on public.room_evals from anon, authenticated;
grant select, insert, update, delete on public.room_evals to authenticated;

drop policy if exists evals_select on public.room_evals;
drop policy if exists evals_insert on public.room_evals;
drop policy if exists evals_update on public.room_evals;
drop policy if exists evals_delete on public.room_evals;
create policy evals_select on public.room_evals for select to authenticated using (rater = (select auth.uid()));
create policy evals_insert on public.room_evals for insert to authenticated with check (
  rater = (select auth.uid())
  and room_id in (select private.my_room_ids())
  and exists (select 1 from public.room_members m where m.room_id = room_evals.room_id and m.user_id = room_evals.ratee));
create policy evals_update on public.room_evals for update to authenticated
  using (rater = (select auth.uid()))
  with check (rater = (select auth.uid()) and room_id in (select private.my_room_ids())
    and exists (select 1 from public.room_members m where m.room_id = room_evals.room_id and m.user_id = room_evals.ratee));
create policy evals_delete on public.room_evals for delete to authenticated using (rater = (select auth.uid()));

-- 사람별 합계. 평가자마다 준 점수를 '인원 × 100' 이 되게 맞춘 뒤 계산한다.
-- perceived 는 다른 팀원 2명 이상이 평가했을 때만 보여 준다 (한 명뿐이면 누가 줬는지 드러나므로)
create or replace function public.room_eval_summary(p_room uuid)
returns table (ratee uuid, claimed int, perceived int, raters int)
language sql stable security definer set search_path = '' as $$
  with ok as (select 1 as x where p_room in (select private.my_room_ids())),
  mem as (select m.user_id from public.room_members m where m.room_id = p_room and exists (select 1 from ok)),
  n as (select count(*)::numeric as c from mem),
  e as (select r.rater, r.ratee, r.points from public.room_evals r
        where r.room_id = p_room and r.rater in (select user_id from mem) and r.ratee in (select user_id from mem)),
  t as (select e.rater, sum(e.points)::numeric as s from e group by e.rater having sum(e.points) > 0),
  s as (select e.rater, e.ratee, e.points * (select c from n) * 100 / t.s as v from e join t on t.rater = e.rater)
  select mem.user_id,
    (select round(s.v)::int from s where s.rater = mem.user_id and s.ratee = mem.user_id),
    case when (select count(*) from s where s.ratee = mem.user_id and s.rater <> mem.user_id) >= 2
         then (select round(avg(s.v))::int from s where s.ratee = mem.user_id and s.rater <> mem.user_id) end,
    (select count(*)::int from s where s.ratee = mem.user_id and s.rater <> mem.user_id)
  from mem
$$;
revoke all on function public.room_eval_summary(uuid) from public, anon;
grant execute on function public.room_eval_summary(uuid) to authenticated;
