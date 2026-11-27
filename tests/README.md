# 공유방 시험 도구 (1바퀴)

진짜 Supabase 없이 내 PC에서 `supabase/rooms.sql`과 공유방 기능을 시험한다.
PGlite(브라우저·Node용 Postgres)로 Supabase의 로그인·파일 저장소를 흉내 낸다.

```
cd tests
npm install
```

## 1. SQL 권한 시험 (47개)
```
node test.mjs ../supabase
```

## 2. 앱을 두 사람으로 써 보기
```
node server.mjs ..
```
- 상현: http://localhost:8765/?u=a
- 우진: http://127.0.0.1:8765/?u=b  (주소가 달라야 브라우저 저장소가 분리됨)
- 서버 표 내용 보기: http://localhost:8765/api/peek

주의: 실시간은 2초마다 확인하는 흉내라 진짜 Supabase와 다르다. 실제 확인은 시험용 Supabase 프로젝트에서 한다.
