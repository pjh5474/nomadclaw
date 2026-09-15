# durable-agents

전제를 주면 **5장짜리 소설**을 Durable Object 에이전트가 이어서 쓰는 예제입니다. 긴 작업을 isolate eviction 뒤에도 이어 가게 하려고 `runFiber`를 씁니다.

## 하는 일

- `NovelistAgent`가 Workers AI로 장을 하나씩 생성
- `setState`로 챕터와 진행률을 클라이언트에 동기화
- Fiber 이름으로 `"write-novel"`을 고정해 재시작 후에도 이어서 작성

## 실행

```bash
npm install
npm run dev
```

Workers AI 바인딩이 필요합니다.
