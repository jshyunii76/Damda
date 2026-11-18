-- Damda 서버 설정 (Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run)
-- 여러 번 실행해도 안전하게 만들어 두었다.

-- 1) 기록 표: 앱의 저장 키 하나 = 한 줄
create table if not exists public.kv (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  k          text        not null,
  v          jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, k)
);
create index if not exists kv_user_updated on public.kv (user_id, updated_at);

-- 고친 시각은 항상 서버 시계로 (기기 시계가 틀려도 순서가 꼬이지 않게)
create or replace function public.kv_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists kv_touch on public.kv;
create trigger kv_touch before insert or update on public.kv
  for each row execute function public.kv_touch();

-- 2) RLS: 자기 기록만 읽고 쓸 수 있다  ※ 이 부분이 빠지면 공개 키만으로 남의 메모를 볼 수 있다
alter table public.kv enable row level security;
-- 로그인한 사용자만 앱에서 이 표를 쓸 수 있게 (로그인 안 한 anon은 막는다)
revoke all on public.kv from anon, authenticated;   -- 표 비우기(truncate) 같은 권한은 RLS를 건너뛰므로 뺀다
grant select, insert, update, delete on public.kv to authenticated;
drop policy if exists kv_select on public.kv;
drop policy if exists kv_insert on public.kv;
drop policy if exists kv_update on public.kv;
drop policy if exists kv_delete on public.kv;
create policy kv_select on public.kv for select to authenticated using (auth.uid() = user_id);
create policy kv_insert on public.kv for insert to authenticated with check (auth.uid() = user_id);
create policy kv_update on public.kv for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy kv_delete on public.kv for delete to authenticated using (auth.uid() = user_id);

-- 3) 사진·파일 저장소: 비공개, 파일 하나 최대 40MB (앱의 첨부 한도와 같게)
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 41943040)
on conflict (id) do update set public = false, file_size_limit = 41943040;

-- 저장소 RLS: '내 ID/…' 폴더 안의 파일만 읽고 쓸 수 있다
drop policy if exists files_select on storage.objects;
drop policy if exists files_insert on storage.objects;
drop policy if exists files_update on storage.objects;
drop policy if exists files_delete on storage.objects;
create policy files_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
