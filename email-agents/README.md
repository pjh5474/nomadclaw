# email-agents

같은 `EmailAgent`가 **채팅**과 **이메일 수신**을 모두 받는 예제입니다.

## 체험

[https://email-agents.warwarsn.workers.dev/](https://email-agents.warwarsn.workers.dev/)

## 하는 일

- `AIChatAgent`로 웹 채팅
- `onEmail`에서 PostalMime으로 원문을 파싱
- `routeAgentEmail` + address resolver로 에이전트에 메일 라우팅

로컬에서 Email Worker 핸들러를 치려면 Wrangler / `/cdn-cgi/handler/email` 경로를 사용합니다. 배포 시에는 Email Routing 설정이 필요합니다.

## 실행

```bash
npm install
npm run dev
```
