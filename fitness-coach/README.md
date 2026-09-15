# fitness-coach

Think로 만든 **개인 피트니스 코치**입니다. Think의 각 기능에 실제 역할을 붙였습니다.

## 체험

[https://fitness-coach.warwarsn.workers.dev/](https://fitness-coach.warwarsn.workers.dev/)

| Think 기능 | 역할 |
|------------|------|
| 워크스페이스 | 훈련 기록. `saveTrainingLog`가 경로를 `logs/YYYY-MM-DD.md`로 고정 |
| memory 컨텍스트 | 몸무게, 부상, 목표 (`set_context`, 세션이 바뀌어도 유지) |
| skills (R2) | 스쿼트 자세, 러닝 프로그램, 스트레칭 가이드. 필요할 때만 `activate_skill` |
| 확장 도구 | 없는 계산기(1RM 등)를 `load_extension`으로 런타임에 작성 |

모델은 `@cf/moonshotai/kimi-k2.5`입니다. UI 왼쪽은 채팅, 오른쪽은 Workspace / Skills / Tools입니다.

## 스킬 파일

로컬 원본은 `skills/<name>/SKILL.md`입니다. R2 버킷 `think-skills`의 `skills/` 접두사로 올려 두었습니다.

```bash
npx wrangler r2 object put think-skills/skills/squat-form/SKILL.md --file=skills/squat-form/SKILL.md --remote
```

## 실행

```bash
npm install
npm run dev
```

테스트 예: 오늘 스쿼트를 보고 → `logs/` 파일 확인 → 체중·무릎·5km 목표를 말한 뒤 새 탭에서 내일 계획 → 스쿼트 자세(스킬) → 1RM 계산기 생성 후 `80kg × 5회`.
