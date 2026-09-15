# ai-chat-agent-foundations

`AIChatAgent`로 스트리밍 채팅을 켜고, 모델이 **도구**를 호출하게 하는 기초 예제입니다.

## 체험

[https://ai-chat-agent-foundations.warwarsn.workers.dev/](https://ai-chat-agent-foundations.warwarsn.workers.dev/)

## 도구

- `getWeather` — 날씨
- `getLocation` — 위치
- `getTickets` / `buyPlaneTicket` — 티켓 조회·구매 (승인 흐름 연습)

채팅 UI는 `@cloudflare/ai-chat` React 훅을 사용합니다.

## 실행

```bash
npm install
npm run dev
```
