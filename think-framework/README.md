# think-framework

`@cloudflare/think` 하네스를 붙인 실험용 채팅 에이전트입니다. `getModel()`만으로 채팅·영속성·스트리밍·워크스페이스 파일 도구가 따라옵니다.

## 체험

[https://think-framework.warwarsn.workers.dev/](https://think-framework.warwarsn.workers.dev/)

## 배우는 것

- `configureContext()` — soul / memory 블록 (`getSystemPrompt` 대신)
- 워크스페이스 파일 목록을 Agent state로 UI에 표시
- `getSkills()` + `skills.r2` (R2 가이드)
- `createExtensionTools` — 런타임에 JS 확장 도구 로드

피트니스 코치 같은 도메인 앱은 [fitness-coach](../fitness-coach)를 보세요.

## 실행

```bash
npm install
npm run dev
```

R2 스킬 버킷을 쓰면 `wrangler.jsonc`의 `SKILLS` 바인딩이 맞아야 합니다.
