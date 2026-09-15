# sub-agents

부모 **Orchestrator**가 Cloudflare API로 리서치를 하는 **Researcher** 서브에이전트를 띄워, 여러 주제를 병렬로 조사하는 예제입니다.

## 하는 일

- `this.subAgent`으로 Researcher DO를 생성
- 진행 상황은 `RpcTarget`으로 UI에 전달
- 조사 결과는 Zod 스키마(`Finding`)로 구조화

한 모델이 모든 검색을 하는 대신, **역할이 있는 자식 에이전트**를 돌리는 패턴입니다.

## 실행

```bash
npm install
npm run dev
```

Cloudflare API 토큰이 필요합니다.
