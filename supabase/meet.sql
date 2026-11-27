-- Damda 팀 회의실 (3바퀴) — rooms.sql 을 먼저 실행한 뒤 SQL Editor 에 붙여 넣고 Run (여러 번 실행해도 안전)
-- 회의실 실시간 채널 'meet:<방ID>' 은 그 방 멤버만 듣고(select) 보낼(insert) 수 있다.
-- 앱은 이 채널을 private 으로 연다. 메시지는 표에 저장되지 않는다 (Realtime 이 권한 확인에만 씀).
-- 참고: https://supabase.com/docs/guides/realtime/authorization

drop policy if exists meet_listen on realtime.messages;
drop policy if exists meet_send on realtime.messages;

create policy meet_listen on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (select 1 from private.my_room_ids() x where 'meet:' || x::text = (select realtime.topic()))
  );

create policy meet_send on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (select 1 from private.my_room_ids() x where 'meet:' || x::text = (select realtime.topic()))
  );
