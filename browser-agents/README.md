# browser-agents

Cloudflare Browser Rendering(Puppeteer)으로 URL을 열고 **SEO 감사**를 하는 채팅 에이전트입니다.

## 하는 일

- 사용자가 URL을 주면 `auditSeo` 도구가 페이지를 방문
- 점수·통과/실패 항목·수정 힌트를 보고
- 스크린샷을 채팅 UI에 표시

`BROWSER` 바인딩이 필요합니다.

## 실행

```bash
npm install
npm run dev
```
