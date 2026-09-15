# web-detective

브라우저를 들고 사이트를 **탐정처럼** 돌아다니는 에이전트입니다. 페이지를 읽고, 링크를 따라가고, 스크린샷·증거를 SQLite에 남깁니다.

## 체험

[https://web-detective.warwarsn.workers.dev/](https://web-detective.warwarsn.workers.dev/)

## 도구

- `readPage` — 현재 페이지 내용
- `followLink` — 링크 이동
- `screenshot` — 증거 캡처
- `browserClose` — 세션 종료

방문 기록과 증거 키는 Agent state와 SQL에 쌓입니다. Browser Rendering 바인딩이 필요합니다.

## 실행

```bash
npm install
npm run dev
```
