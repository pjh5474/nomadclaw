# rag-agents

업로드한 문서를 조각 내 **Workers AI 임베딩 + Vectorize**에 넣고, 질문에 가까운 조각을 찾아 답하는 RAG 에이전트입니다.

## 하는 일

- 마크다운을 약 500자 단위로 청크
- SHA-256으로 같은 내용은 다시 임베딩하지 않음
- 목록·삭제 시 SQL + Vectorize + R2를 함께 정리

문서 기반 Q&A의 저장·검색·삭제 루프를 한 앱에서 봅니다.

## 실행

```bash
npm install
npm run dev
```

Vectorize 인덱스와 AI 바인딩이 `wrangler.jsonc`에 있어야 합니다.
