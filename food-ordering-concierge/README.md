# food-ordering-concierge

채팅으로 가게·메뉴를 고르고 장바구니에 담아 주문하는 **음식 주문 컨시어지**입니다.

## 체험

[https://food-ordering-concierge.warwarsn.workers.dev/](https://food-ordering-concierge.warwarsn.workers.dev/)

## 도구

- `getLocation` / `getStore` / `getMenu`
- `addToCart` / `viewCart` / `placeOrder`

장바구니는 Agent state로 UI와 동기화됩니다. 카드 번호 같은 입력은 도구 스키마로 검증합니다.

## 실행

```bash
npm install
npm run dev
```
