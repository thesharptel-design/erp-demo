---
name: structure-first-no-spaghetti
description: >-
  Guides implementation so changes fit the existing architecture and stay
  maintainable. Use when building features, fixing bugs, refactoring, or when the
  user mentions structure, 임시방편, 스파게티 코드, coupling, or whole-system
  clarity.
---

# Structure first, no spaghetti

임시방편으로 스파게티코드 만들지 말고 , 항상 구조 생각하고 전체적으로 꼬이는게 없이 만들어야해.

## Instructions for the agent

1. **Before writing code**: Name the layer or module (UI, API, domain, data). Prefer extending existing patterns over new ad-hoc paths.
2. **No “just make it work” shortcuts** that duplicate logic, bypass boundaries, or add hidden globals unless the user explicitly accepts that tradeoff after you explain it.
3. **After a change**: Mentally trace one flow (caller → callee → data). If the same concern appears in many places, consolidate or call out the debt instead of copying again.
4. **When unsure**: Propose a small structure (file placement, function split, interface) in one or two sentences, then implement—do not pile logic into one giant block.

## Common smells to avoid

- **권한·비즈니스 규칙을 클라이언트만으로 결정** — UI에서 숨기기만 하고 서버/RLS에서 검증하지 않기.
- **같은 검증을 페이지·API·DB에 복붙** — 한 곳(보통 서버 또는 DB)을 진실로 두고 나머지는 호출·타입으로 맞추기.
- **경계 우회** — “급해서” 공용 훅/서비스를 건너뛰고 페이지에서 직접 DB 클라이언트를 새로 만들기.

## Quick check before finishing

- Does this file still have a single clear responsibility?
- Would a new teammate see where to add the next similar case without untangling imports?
- If something is intentionally minimal, is it labeled (comment or reply) so it is not mistaken for the final shape?
