-- Damda 공유방 (1바퀴) — setup.sql을 실행한 뒤에 SQL Editor에 통째로 붙여 넣고 Run
-- 여러 번 실행해도 안전하게 만들었다.  ※ 초안: 아직 실제 DB에서 실행해 보지 않았다.
--
-- 구조
--   rooms         방 1개 = 1줄 (코드·이름·방장·권한)
--   room_members  누가 어느 방에 들어와 있는지 (방에서 쓰는 이름 포함)
--   room_msgs     메모 1개 = 1줄 (여러 명이 동시에 써도 서로 덮어쓰지 않게)
-- 권한 확인 함수는 Data API에 노출되지 않는 private 스키마에 둔다.

create schema if not exists private;

-- 1) 표 ---------------------------------------------------------------
create table if not exists public.rooms (
  id         uuid        primary key default gen_random_uuid(),
  code       text        not null unique check (code ~ '^[A-Z2-9]{6}$'),
  name       text        not null default '' check (char_length(name) <= 60),
  owner      uuid        references auth.users(id) on delete set null,
  perm       text        not null default 'edit' check (perm in ('edit','view')),
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id      uuid        not null references public.rooms(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  display_name text        not null default '' check (char_length(display_name) <= 20),
  role         text        not null default 'member' check (role in ('owner','member')),
  joined_at    timestamptz not null default now(),
  primary key (room_id, user_id)
);
-- (room_id, user_id) 인덱스는 room_id가 앞이라 user_id로 찾을 때 쓰이지 않는다 → 따로 만든다
create index if not exists room_members_user on public.room_members (user_id);

create table if not exists public.room_msgs (
  room_id    uuid        not null references public.rooms(id) on delete cascade,
  id         text        not null check (char_length(id) <= 40),   -- 앱의 메모 ID('m…')
  data       jsonb       not null,                                   -- 앱의 메모 객체 그대로
  author     uuid        references auth.users(id) on delete set null, -- 처음 쓴 사람 (2바퀴 기여 기록의 기초)
  edited_by  uuid        references auth.users(id) on delete set null, -- 마지막으로 고친 사람
  deleted    boolean     not null default false,                     -- 지우기 = 표시만 (실시간 반영을 위해)
  updated_at timestamptz not null default now(),
  primary key (room_id, id)
);
create index if not exists room_msgs_updated on public.room_msgs (updated_at);

create table if not exists private.join_fail (       -- 코드 맞히기 시도 제한용
  user_id uuid        not null,
  at      timestamptz not null default now()
);
create index if not exists join_fail_user on private.join_fail (user_id, at);

-- 2) 작성자·시각은 서버가 정한다 (앱이 보낸 값은 믿지 않는다) --------------
create or replace function private.msg_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.author := (select auth.uid());
  else
    new.author := old.author;          -- 처음 쓴 사람은 바뀌지 않는다
    new.room_id := old.room_id;
    new.id := old.id;
  end if;
  new.edited_by  := (select auth.uid());
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists msg_stamp on public.room_msgs;
create trigger msg_stamp before insert or update on public.room_msgs
  for each row execute function private.msg_stamp();

-- 마지막 사람이 나가면 방을 지운다
create or replace function private.room_gc() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.room_members where room_id = old.room_id) then
    delete from public.rooms where id = old.room_id;
  end if;
  return null;
end $$;
drop trigger if exists room_gc on public.room_members;
create trigger room_gc after delete on public.room_members
  for each row execute function private.room_gc();

-- 3) 권한 확인 함수 (정책끼리 서로 참조하며 무한반복되는 것을 막기 위해 security definer) --
create or replace function private.my_room_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select room_id from public.room_members where user_id = (select auth.uid())
$$;

create or replace function private.can_write(r uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members m join public.rooms x on x.id = m.room_id
    where m.room_id = r and m.user_id = (select auth.uid())
      and (x.perm = 'edit' or m.role = 'owner')
  )
$$;

grant usage on schema private to authenticated;
revoke all on function private.my_room_ids(), private.can_write(uuid) from public, anon;
grant execute on function private.my_room_ids(), private.can_write(uuid) to authenticated;

-- 4) RLS ----------------------------------------------------------------
alter table public.rooms        enable row level security;
alter table public.room_members enable row level security;
alter table public.room_msgs    enable row level security;

revoke all on public.rooms, public.room_members, public.room_msgs from anon, authenticated;
grant select, update          on public.rooms        to authenticated;   -- 만들기는 create_room()으로만
grant select, update, delete  on public.room_members to authenticated;   -- 참여는 join_room()으로만
grant select, insert, update  on public.room_msgs    to authenticated;   -- 지우기는 deleted 표시로

drop policy if exists rooms_select on public.rooms;
drop policy if exists rooms_update on public.rooms;
create policy rooms_select on public.rooms for select to authenticated
  using (id in (select private.my_room_ids()));
create policy rooms_update on public.rooms for update to authenticated   -- 이름·권한 바꾸기는 방장만
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

drop policy if exists members_select on public.room_members;
drop policy if exists members_update on public.room_members;
drop policy if exists members_delete on public.room_members;
create policy members_select on public.room_members for select to authenticated
  using (room_id in (select private.my_room_ids()));
create policy members_update on public.room_members for update to authenticated   -- 내 이름만 고친다
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy members_delete on public.room_members for delete to authenticated   -- 나만 나간다
  using (user_id = (select auth.uid()));

drop policy if exists msgs_select on public.room_msgs;
drop policy if exists msgs_insert on public.room_msgs;
drop policy if exists msgs_update on public.room_msgs;
create policy msgs_select on public.room_msgs for select to authenticated
  using (room_id in (select private.my_room_ids()));
create policy msgs_insert on public.room_msgs for insert to authenticated
  with check ((select private.can_write(room_id)));
create policy msgs_update on public.room_msgs for update to authenticated
  using ((select private.can_write(room_id))) with check ((select private.can_write(room_id)));

-- 방 이름·권한 외의 칸(코드·방장)은 고치지 못하게
revoke update on public.rooms from authenticated;
grant update (name, perm) on public.rooms to authenticated;
revoke update on public.room_members from authenticated;
grant update (display_name) on public.room_members to authenticated;

-- 5) 앱이 부르는 함수 (rpc) ---------------------------------------------
-- 방 만들기: 코드가 겹치면 오류(unique) → 앱이 새 코드로 다시 부른다
create or replace function public.create_room(p_code text, p_name text, p_perm text, p_display text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); rid uuid;
begin
  if uid is null then raise exception 'login required'; end if;
  insert into public.rooms (code, name, owner, perm)
    values (upper(p_code), left(coalesce(p_name,''),60), uid, coalesce(p_perm,'edit'))
    returning id into rid;
  insert into public.room_members (room_id, user_id, display_name, role)
    values (rid, uid, left(coalesce(p_display,''),20), 'owner');
  return rid;
end $$;

-- 코드로 참여: 10분에 10번 넘게 틀리면 막는다
create or replace function public.join_room(p_code text, p_display text)
returns table (room_id uuid, name text, perm text, owner uuid)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := (select auth.uid()); r public.rooms;
begin
  if uid is null then raise exception 'login required'; end if;
  if (select count(*) from private.join_fail f
        where f.user_id = uid and f.at > now() - interval '10 minutes') >= 10 then
    raise exception 'too many attempts';
  end if;
  select * into r from public.rooms x where x.code = upper(p_code);
  if not found then
    insert into private.join_fail (user_id) values (uid);
    return;                                   -- 빈 결과 = 그런 방 없음
  end if;
  insert into public.room_members (room_id, user_id, display_name)
    values (r.id, uid, left(coalesce(p_display,''),20))
    on conflict on constraint room_members_pkey do nothing;   -- 이미 멤버면 그대로
  return query select r.id, r.name, r.perm, r.owner;
end $$;

revoke all on function public.create_room(text,text,text,text), public.join_room(text,text) from public, anon;
grant execute on function public.create_room(text,text,text,text), public.join_room(text,text) to authenticated;

-- 6) 사진·파일: files 저장소의 'r/방ID/파일ID' 는 그 방 멤버가 읽고, 쓸 수 있는 멤버가 올린다 --
drop policy if exists room_files_select on storage.objects;
drop policy if exists room_files_insert on storage.objects;
drop policy if exists room_files_update on storage.objects;
create policy room_files_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = 'r'
         and (storage.foldername(name))[2] in (select x::text from private.my_room_ids() x));
create policy room_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = 'r'
         and exists (select 1 from private.my_room_ids() x
                     where x::text = (storage.foldername(name))[2] and private.can_write(x)));
create policy room_files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = 'r'
         and exists (select 1 from private.my_room_ids() x
                     where x::text = (storage.foldername(name))[2] and private.can_write(x)));

-- 7) 실시간: 메모·멤버·방 권한이 바뀌면 앱에 바로 알린다 --------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_msgs') then
    alter publication supabase_realtime add table public.room_msgs;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_members') then
    alter publication supabase_realtime add table public.room_members;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
    alter publication supabase_realtime add table public.rooms;     -- 권한(보기만) 바뀜도 바로 알린다
  end if;
end $$;
