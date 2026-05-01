---
name: supabase-schema-migrations
description: >-
  Aligns Supabase Postgres schema with app code before and after migrations or
  direct SQL edits. Checks tables, columns, constraints, indexes, and RLS for
  drift, duplicates, and omissions; suggests performance-oriented fixes. Use when
  writing or editing supabase/migrations, applying migrations, running DDL,
  changing RPC/views, syncing TypeScript DB types, or when the user mentions
  Supabase schema, database migration, or direct database modification.
---

# Supabase schema and migrations

## Related project skill

RLS 설계 원칙, 서비스 롤, 쿼리 패턴(`select` 컬럼 명시, 페이지네이션), 소프트 삭제·에러 메시지 등 **데이터 무결성·보안 관점**은 `.cursor/skills/supabase-data-integrity/SKILL.md`를 함께 따른다. 이 스킬은 마이그레이션·스키마 드리프트·MCP DDL 절차에 우선한다.

## User requirement (verbatim)

db관련 마이그레이션이 있을때나 db를 직접 수정할필요가 있을때는 supabase db table scheme를 체크해서 변수의 중복이나 꼬임 누락이 없게해서 항상 최적화를 할수 있도록 해줘. 이는 빠른 속도를 위함이어서 매우 중요한 사안이야.

## When this skill applies

- Adding or changing files under `supabase/migrations/`.
- Applying or reviewing DDL (tables, columns, types, constraints, indexes, views, functions, triggers).
- Advising on or executing direct database changes (prefer tracked migrations in-repo).
- Updating generated DB types or fixing type drift vs the database.

## Ground truth order (fast, low mistake rate)

1. **Repo migrations**: Scan `supabase/migrations/` for existing objects (same table/column/index names, renames, drops). New migration filenames must stay chronological and unique.
2. **Live or target schema**: Prefer Supabase MCP after reading tool schemas: `list_tables` with `verbose: true` on relevant schemas (at least `public`). Use `list_migrations` to compare applied vs repo.
3. **App layer**: Grep the codebase for affected table/column/RPC names so UI, API routes, and server code stay in sync with the schema.

Do not invent columns or types; confirm against migrations + `list_tables` (verbose) or `information_schema` queries via MCP if needed.

## DDL and data changes

- Use **`apply_migration`** for DDL (per MCP: use it instead of `execute_sql` for schema changes).
- For one-off diagnostic **SELECT** or small non-DDL checks, `execute_sql` is acceptable; avoid ad-hoc DDL outside migrations unless the user explicitly wants it and the repo policy allows it.
- After substantive DDL: run **`get_advisors`** for `performance` and `security` (RLS, missing policies, index hints). Include remediation URLs when reporting.

## Duplicates, tangles, omissions (“중복·꼬임·누락”)

Check explicitly:

| Risk | What to verify |
|------|------------------|
| Duplicate indexes | Same columns covered twice under different index names; redundant UNIQUE + UNIQUE INDEX. |
| Constraint / name clashes | New constraint names vs existing; renamed columns leaving dead indexes or policies. |
| FK and types | Referenced table/column exists; ON DELETE/UPDATE behavior matches product rules. |
| RLS | Policies still reference correct column names after renames; no widening access by mistake. |
| RPC / views | `CREATE OR REPLACE` matches column order and types consumers expect; dropped columns removed from selects. |
| Idempotency | Migrations safe to re-run or guarded with `IF NOT EXISTS` / existence checks where appropriate. |

## Speed (optimization) checklist

- Add or confirm **indexes** for foreign keys, frequent `WHERE`/`JOIN` columns, and ordering columns used in list endpoints.
- Prefer **narrow columns** and correct **types** (e.g. `timestamptz`, enums) over oversized text.
- Avoid redundant **triggers** or duplicate work across triggers and app code.
- For large tables: consider **concurrent** index creation patterns if the project already uses them; follow existing migration style in this repo.

## Types and documentation

- After schema changes that affect the app: use **`generate_typescript_types`** when appropriate so TS types match Postgres.
- Summarize what changed (tables/columns/indexes/RPC) in the PR or reply so non-expert readers can follow.

## Efficiency for the agent

- Read MCP tool descriptor JSON under the project `mcps/user-supabase/tools/` before calling tools.
- Start with **`list_tables` verbose** on the smallest set of schemas that covers the change; expand only if needed.
