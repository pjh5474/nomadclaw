# introduction-to-alarms

Durable Object WebSocket 채팅방에 **Alarm**을 붙여, 오래된 메시지를 주기적으로 지우는 입문 예제입니다.

## 하는 일

- 닉네임·방 ID로 WebSocket 채팅
- SQLite `messages`에 저장
- Alarm이 약 1분마다 돌며, 5분이 지난 메시지를 삭제

Agent의 `schedule()`과 같은 “나중에 다시 깨우기”를 DO 수준에서 먼저 봅니다.

## 실행

```bash
npm install
npm run dev
```
