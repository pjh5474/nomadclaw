# agent-foundations

Agents SDK로 만든 **실시간 투표 채팅방**입니다. 로비에서 방을 만들고, 참가자는 채팅·투표를 하고, 관전자는 결과만 봅니다.

## 체험

[https://agent-foundations.warwarsn.workers.dev/](https://agent-foundations.warwarsn.workers.dev/)

## 배우는 것

- 방마다 `ChattingRoomAgent` Durable Object
- 전역 목록은 `RoomDirectoryAgent`
- WebSocket 채팅과 `@callable` 투표 RPC를 한 DO에 공존
- 관전자 `readonly` 연결: 내용은 보이되 쓰기·투표는 차단
- 표는 SQL `poll_votes`, 화면 스냅샷은 Agent state

## 실행

```bash
npm install
npm run dev
```

브라우저 두 개(또는 시크릿)로 같은 방에 들어가 채팅과 투표가 동기화되는지, 닉네임 없이 관전하면 참여가 막히는지 확인하세요.
