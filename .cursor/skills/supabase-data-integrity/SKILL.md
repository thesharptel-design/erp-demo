---
name: supabase-data-integrity
description: >-
  Ensures type-safe, secure, and structured data handling with Supabase.
  Focuses on RLS, database types, and preventing data corruption.
  Use when writing or reviewing Supabase client/server queries, RLS policies,
  RPCs, generated DB types, soft-delete patterns, service role usage, or when the
  user mentions data integrity, N+1 queries, or bypassing RLS. For migration
  files and DDL workflow, prefer supabase-schema-migrations.
---

# Supabase & Data Integrity

데이터는 회사의 자산이다. 임시방편으로 데이터를 밀어넣지 말고,
항상 무결성과 보안을 최우선으로 하여 설계한다.

## Related project skill

Migration filenames, MCP DDL workflow, and schema drift checks: read and follow
`.cursor/skills/supabase-schema-migrations/SKILL.md` when editing
`supabase/migrations/` or changing Postgres schema.

## Principles

1. **RLS is Non-Negotiable:** 모든 테이블은 생성 즉시 RLS(Row Level Security)를 활성화한다. "모두 허용" 정책은 절대 금지하며, 반드시 페르소나(Admin, User, Owner)에 기반한 정책을 수립한다.
2. **Type-Safety First:** `any` 타입을 사용하지 않는다. Supabase CLI로 생성한 타입(이 프로젝트: `lib/database.types.ts`)을 단일 소스로 삼아 모든 데이터 요청·반환 타입을 정의한다.
3. **Server-side Logic Preference:** 복잡한 연산(예: 육아휴직 잔여일수 계산)은 가급적 데이터베이스 함수(RPC)나 서버 사이드 로직에서 처리하여 클라이언트 코드의 스파게티화를 방지한다.
4. **Logical Deletion:** ERP 특성상 중요한 데이터는 직접 삭제(Hard Delete)하지 않고, `is_deleted` 또는 `status` 컬럼을 활용한 논리 삭제(Soft Delete)를 고려한다.

## Critical Rules

### 1. Security & RLS

- 새로운 테이블 생성 시 반드시 RLS를 활성화(`ALTER TABLE ENABLE RLS`)하는 SQL을 함께 제시한다.
- `auth.uid()`를 사용하여 사용자가 자신의 데이터만 수정/삭제할 수 있는지 검증한다.
- 서비스 역할(Service Role) 키는 서버 사이드 환경에서만 사용하며, 클라이언트 코드에 노출되지 않도록 엄격히 관리한다.

### 2. Query Optimization

- **No Select *:** 필요한 컬럼만 명시적으로 호출한다. (예: `select('id, name, created_at')`)
- **N+1 Query Prevention:** 외래키(FK) 관계를 활용한 조인 쿼리(`.select('*, departments(*)')`)를 사용하되, 너무 깊은 중첩은 성능 저하를 일으키므로 주의한다.
- **Pagination:** 대량의 데이터를 불러올 때는 반드시 `.range()`를 사용한 페이지네이션을 구현한다.

### 3. Migration & Schema Change

- DB 스키마를 변경할 때는 기존 데이터에 미칠 영향을 분석하여 보고한다.
- 특히 **Nullable** 컬럼을 **Not Null**로 바꿀 때 기존 데이터의 기본값(Default value) 처리를 어떻게 할지 먼저 사용자에게 묻는다.
- 데이터 관계(Foreign Key) 설정 시 `ON DELETE CASCADE` 또는 `SET NULL` 옵션을 신중하게 선택한다.

### 4. Error Handling

- 모든 Supabase 요청은 `if (error) throw error` 또는 적절한 에러 핸들링 로직을 포함한다.
- 사용자에게는 기술적 에러 메시지가 아닌, 이해하기 쉬운 한글 메시지를 출력하도록 설계한다.

## Quick check before finishing

- 이 쿼리가 RLS 정책을 우회하거나 보안 취약점을 만들지 않는가?
- 타입 정의가 DB 스키마와 100% 일치하는가?
- 트랜잭션이 필요한 복잡한 작업(여러 테이블 동시 수정)인가? 그렇다면 RPC나 서버 로직으로 처리했는가?
