# NomadClaw

Cloudflare 위에서 **AI와 Agent**를 공부하고, 실제로 돌아가는 사례를 모아 둔 저장소입니다.

Workers, Durable Objects, Agents SDK, Workers AI, Think 같은 OpenClaw(Cloudflare Agents) 스택을 단계별로 만져 보면서, 채팅·상태·도구·검색·브라우저·이메일·워크플로까지 “에이전트가 어떻게 살아 있는지”를 직접 확인하는 것이 목표입니다.

각 폴더는 독립된 앱입니다. 이론만 정리하지 않고, `npm run dev`로 실행할 수 있는 작은 제품을 만듭니다.

## 스택

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Agents SDK](https://developers.cloudflare.com/agents/) (`agents`, `@cloudflare/ai-chat`, `@cloudflare/think`)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- React + Vite (UI가 있는 앱)

## 프로젝트 목록

기초부터 응용 순입니다. 처음부터 따라가도 되고, 관심 있는 주제만 골라 봐도 됩니다.

### 1. Cloudflare 기초

| 폴더 | 한 줄 |
|------|--------|
| [introduction-to-workers](./introduction-to-workers) | Worker + KV로 노트 API 만들기 |
| [introduction-to-durable-objects](./introduction-to-durable-objects) | Durable Object SQLite 카운터 |
| [introduction-to-alarms](./introduction-to-alarms) | DO WebSocket 채팅 + Alarm으로 오래된 메시지 삭제 |

### 2. Agent 기초

| 폴더 | 한 줄 |
|------|--------|
| [agent-foundations](./agent-foundations) | 멀티유저 투표 채팅방 (로비, 관전자, 실시간 투표) |
| [durable-agents](./durable-agents) | 장편 소설을 Fiber로 이어 쓰는 에이전트 |
| [ai-chat-agent-foundations](./ai-chat-agent-foundations) | `AIChatAgent` + 도구 호출 채팅 |
| [guessing-game](./guessing-game) | 스무고개. 정답은 서버에만 두고 질문은 LLM이 답함 |

### 3. 도구, 주문, 워크플로

| 폴더 | 한 줄 |
|------|--------|
| [food-ordering-concierge](./food-ordering-concierge) | 메뉴·장바구니·주문 도구를 쓰는 음식 주문 컨시어지 |
| [workflows](./workflows) | 피자 주문 승인·결제 재시도 `AgentWorkflow` |
| [email-agents](./email-agents) | 이메일 수신과 채팅이 한 에이전트에 붙는 예제 |

### 4. 브라우저

| 폴더 | 한 줄 |
|------|--------|
| [browser-agents](./browser-agents) | Browser Rendering으로 URL SEO 감사 |
| [web-detective](./web-detective) | 페이지를 읽고 링크를 따라가며 증거를 모으는 탐정 에이전트 |

### 5. RAG

| 폴더 | 한 줄 |
|------|--------|
| [rag-agents](./rag-agents) | 문서를 조각내 Vectorize에 넣고 질문하기 |
| [web-rag-agents](./web-rag-agents) | URL을 저장하고, 저장한 글 내용을 출처와 함께 답하기 |

### 6. 여러 에이전트

| 폴더 | 한 줄 |
|------|--------|
| [sub-agents](./sub-agents) | 오케스트레이터가 리서치 서브에이전트를 병렬로 돌림 |
| [debate-arena](./debate-arena) | 양측 대변인 서브에이전트 + 판정 스트리밍 |

### 7. Think

| 폴더 | 한 줄 |
|------|--------|
| [think-framework](./think-framework) | Think 하네스: 컨텍스트, 워크스페이스, 스킬, 확장 도구 |
| [fitness-coach](./fitness-coach) | 개인 피트니스 코치 (로그, 메모리, R2 스킬, 런타임 계산기) |

## 실행

각 폴더에서:

```bash
cd <project>
npm install
npm run dev
```

Workers AI, R2, Browser Rendering, Vectorize, Email 등 바인딩이 필요한 앱은 Cloudflare 계정과 `wrangler` 로그인이 필요합니다. 자세한 내용은 해당 폴더의 `README.md`와 `wrangler.jsonc`를 보세요.

## 이 저장소가 아닌 것

하나의 배포 앱이 아닙니다. 모노레포 패키지 공유도 아닙니다. **학습용 미니 앱 모음**입니다.
