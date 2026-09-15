# introduction-to-workers

Cloudflare Worker와 KV로 간단한 노트 API를 만드는 입문 예제입니다. Agent SDK 전에 **요청을 받아 저장소에 읽고 쓰는** 감각을 익힙니다.

## 체험

[https://introduction-to-workers.warwarsn.workers.dev/](https://introduction-to-workers.warwarsn.workers.dev/)

## 하는 일

- `GET /` — API 사용법
- `GET /notes` — 저장된 노트 키 목록
- `GET /notes/<key>` — 노트 조회
- `POST /notes/<key>` — 노트 생성 (KV `CLAW_KV_DB`)

## 실행

```bash
npm install
npm run dev
```
