# workflows

피자 주문을 **승인 → 결제(재시도) → 완료**로 이어 가는 `AgentWorkflow` 예제입니다.

## 체험

[https://workflows.warwarsn.workers.dev/](https://workflows.warwarsn.workers.dev/)

## 하는 일

- `RestaurantAgent`가 주문 state를 들고 UI와 동기화
- `PizzaWorkflow`가 `waitForApproval`로 사람 승인을 기다림
- 결제 단계는 `step.do` + 재시도 정책

에이전트 한 턴 안에 다 끝내지 못하는 **오래 가는 업무**를 Workflow로 떼어 보는 연습입니다.

## 실행

```bash
npm install
npm run dev
```
