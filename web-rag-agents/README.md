# web-rag-agents

관심 글 **URL을 저장**한 뒤, 그 내용을 바탕으로 질문하는 세컨드 브레인입니다. Browser Rendering `/markdown`으로 본문을 가져오고 Vectorize로 검색합니다.

## 도구

- `saveUrl` — 페이지를 청크·임베딩해 저장
- `recall` — 질문과 가까운 조각 (출처 URL·제목 포함)
- `listSources` — 저장한 글 목록

답할 때 출처 URL을 붙이도록 시스템 프롬프트와 recall 결과를 맞춰 두었습니다.

## 실행

```bash
npm install
npm run dev
```

Browser Rendering용 `ACCOUNT_ID` / `API_TOKEN`과 Vectorize가 필요합니다.
