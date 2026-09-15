# introduction-to-durable-objects

Durable Object 안에 SQLite를 두고, 요청마다 카운트를 올리고 내리는 입문 예제입니다. Agent가 쓰는 **인스턴스당 상태**의 토대가 됩니다.

## 체험

[https://introduction-to-durable-objects.warwarsn.workers.dev/](https://introduction-to-durable-objects.warwarsn.workers.dev/)

## 하는 일

- `DurableCounter` DO가 `counts` 테이블에 IP·도시·국가와 함께 이력을 남깁니다.
- `increase` / `decrease`로 값을 바꾸고, 같은 DO를 치면 이전 값이 유지됩니다.

## 실행

```bash
npm install
npm run dev
```
