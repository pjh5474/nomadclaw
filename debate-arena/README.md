# debate-arena

주제를 주면 부모 에이전트가 **찬반 두 측**을 정하고, 대변인 서브에이전트가 각자 주장을 만든 뒤 판정이 스트림됩니다.

## 체험

[https://debate-arena.warwarsn.workers.dev/](https://debate-arena.warwarsn.workers.dev/)

## 하는 일

- `Advocate` 서브에이전트 두 명을 `Promise.all`로 동시에 호출
- 주장 스키마는 정확히 3개 논점 (`Output.object` + Zod)
- Stop은 채팅 abort뿐 아니라 `abortSubAgent`로 자식도 취소
- 서브에이전트 오류는 UI에 따로 표시

`sub-agents`의 리서치 패턴을 **토론**으로 바꾼 응용입니다.

## 실행

```bash
npm install
npm run dev
```
