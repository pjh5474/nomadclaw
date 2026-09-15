# guessing-game

스무고개입니다. **정답은 서버 SQLite에만** 두고, 모델은 예/아니오로 힌트를 줍니다. 사용자가 정답을 맞히면 게임이 끝납니다.

## 체험

[https://guessing-game.warwarsn.workers.dev/](https://guessing-game.warwarsn.workers.dev/)

## 배우는 것

- Agent state에는 공개 정보만 (정답 문자열은 빼 둠)
- 카테고리별 시크릿, 질문 횟수, 히스토리
- 채팅 스트림과 `@callable`을 섞어 게임 루프를 만듦

## 실행

```bash
npm install
npm run dev
```
