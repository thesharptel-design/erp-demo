---
name: structure-first-no-spaghetti
description: >-
  Keep code changes aligned with the existing architecture and maintainable.
  Use when building features, fixing bugs, refactoring, touching cross-module
  logic, or when the user mentions 구조, 임시방편, 스파게티 코드, coupling,
  maintainability, or whole-system clarity.
---

# Structure First, No Spaghetti

임시방편으로 스파게티 코드를 만들지 말고, 기존 구조 안에서 전체 흐름이 꼬이지 않게 만든다.

## Instructions

1. Before writing code, identify the changed layer: UI, API, domain, data, auth/RLS, or integration.
2. Extend existing project patterns before adding a new path, helper, or abstraction.
3. Avoid shortcuts that duplicate logic, bypass boundaries, or add hidden globals unless the user accepts the tradeoff after it is explained.
4. After a change, trace one flow: caller -> callee -> data. If the same concern appears repeatedly, consolidate it or call out the debt.
5. When unsure, propose a small structure in one or two sentences, then implement.

## Common Smells To Avoid

- Do not decide permissions or business rules only in the client. Validate in server/API/RLS/DB where appropriate.
- Do not blindly copy the same validation across page, API, and DB. Keep one source of truth, usually server or DB, and align callers with types.
- Do not bypass boundaries by creating direct DB clients inside pages when shared hooks/services already exist.
- Do not keep piling data loading, permission checks, UI state, print logic, and popup logic into one large component.

## Quick Check Before Finishing

- Single responsibility still clear?
- Next similar case easy to place?
- Core flows intact: approvals, outbound requests, permissions/RLS, inventory, Supabase RPC/migrations?
- If intentionally minimal, labeled as such in a comment or reply?
