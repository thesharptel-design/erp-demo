---
name: shadcn-ui
description: >-
  Manages shadcn components and projects — adding, searching, fixing, debugging,
  styling, and composing UI. Use when working with shadcn/ui, component
  registries, presets, components.json, or when the user mentions shadcn init,
  blocks, or --preset.
---

# shadcn/ui

A framework for building UI, components, and design systems. Components are added as source code via the CLI.

**Project context:** When you need current aliases, `isRSC`, `tailwindVersion`, installed components, etc., run `npx shadcn@latest info --json` in the project root (use the repo’s package manager: `pnpm dlx` / `bunx` if that is what the project uses).

**After major shadcn / Tailwind / Radix upgrades:** Re-run `info --json`, spot-check renamed APIs in this skill’s rules (FieldGroup, Dialog, etc.), and align examples with the installed component source—do not assume old prop names still apply.

## Principles

1. **Use existing components first.** Use `npx shadcn@latest search` before writing custom UI. Check community registries too.
2. **Compose, don't reinvent.** Settings page = Tabs + Card + form controls. Dashboard = Sidebar + Card + Chart + Table.
3. **Use built-in variants before custom styles.** `variant="outline"`, `size="sm"`, etc.
4. **Use semantic colors.** `bg-primary`, `text-muted-foreground` — never raw values like `bg-blue-500`.

## Critical Rules (always enforce)

### Styling & Tailwind

- **`className` for layout, not styling.** Do not override component colors or typography arbitrarily.
- **No `space-x-*` or `space-y-*`.** Use `flex` with `gap-*`. For vertical stacks: `flex flex-col gap-*`.
- **Use `size-*` when width and height are equal.** `size-10` not `w-10 h-10`.
- **Use `truncate` shorthand.** Not `overflow-hidden text-ellipsis whitespace-nowrap`.
- **No manual `dark:` color overrides.** Use semantic tokens (`bg-background`, `text-muted-foreground`).
- **Use `cn()` for conditional classes.** Avoid long template-literal ternaries for classes.
- **No manual `z-index` on overlay components.** Dialog, Sheet, Popover, etc. manage stacking.

### Forms & Inputs

- **Forms use `FieldGroup` + `Field`.** Do not use raw `div` with `space-y-*` or bare `grid gap-*` for form layout when Field primitives exist.
- **`InputGroup` uses `InputGroupInput` / `InputGroupTextarea`.** Not raw `Input` / `Textarea` inside `InputGroup`.
- **Buttons inside inputs:** `InputGroup` + `InputGroupAddon`.
- **Option sets (2–7 choices):** `ToggleGroup` — do not loop `Button` with manual active state.
- **`FieldSet` + `FieldLegend`** for grouping related checkboxes/radios.
- **Validation:** `data-invalid` on `Field`, `aria-invalid` on the control. Disabled: `data-disabled` on `Field`, `disabled` on the control.

### Component structure

- **Items inside their Group.** `SelectItem` → `SelectGroup`. `DropdownMenuItem` → `DropdownMenuGroup`. `CommandItem` → `CommandGroup`.
- **Custom triggers:** `asChild` (radix) or `render` (base) per project `base` in `components.json`.
- **Dialog, Sheet, Drawer** always need a **Title** (`DialogTitle`, etc.). Use `className="sr-only"` if visually hidden.
- **Full Card composition.** `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` — do not dump everything in `CardContent`.
- **Button:** no built-in `isPending` / `isLoading` — compose with `Spinner` + `data-icon` + `disabled`.
- **`TabsTrigger` inside `TabsList`.** Never render triggers directly under `Tabs`.
- **`Avatar` always needs `AvatarFallback`.**

### Use components, not custom markup

- **Callouts:** `Alert`. **Empty states:** `Empty`. **Toast:** `toast()` from `sonner`. **Dividers:** `Separator`. **Loading:** `Skeleton`. **Status chips:** `Badge`.

### Icons

- **Icons in `Button`:** `data-icon="inline-start"` or `data-icon="inline-end"` on the icon.
- **No sizing classes on icons inside primitives** that already size icons — avoid redundant `size-4` / `w-4 h-4` unless the project pattern says otherwise.
- **Pass icons as components** (e.g. `icon={CheckIcon}`), not string keys, when the API expects that.

### CLI

- **Never decode or fetch preset codes manually.** Pass them to `npx shadcn@latest apply --preset <code>` (existing project) or `npx shadcn@latest init --preset <code>` (new init).

## Key patterns (correct vs wrong)

```tsx
// Form: FieldGroup + Field
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" />
  </Field>
</FieldGroup>

// Validation
<Field data-invalid>
  <FieldLabel>Email</FieldLabel>
  <Input aria-invalid />
  <FieldDescription>Invalid email.</FieldDescription>
</Field>

// Button + icon
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

// Spacing: gap, not space-y
<div className="flex flex-col gap-4">  // correct

// Avatar size
<Avatar className="size-10">   // correct
```

## Component selection (quick map)

| Need | Use |
|------|-----|
| Button / action | `Button` + variant |
| Form inputs | `Input`, `Select`, `Combobox`, `Switch`, `Checkbox`, `RadioGroup`, `Textarea`, … |
| 2–5 options | `ToggleGroup` |
| Data | `Table`, `Card`, `Badge`, `Avatar` |
| Nav | `Sidebar`, `NavigationMenu`, `Breadcrumb`, `Tabs`, `Pagination` |
| Overlays | `Dialog`, `Sheet`, `Drawer`, `AlertDialog` |
| Feedback | `sonner`, `Alert`, `Progress`, `Skeleton`, `Spinner` |
| Command palette | `Command` in `Dialog` |
| Charts | `Chart` (Recharts) |
| Layout | `Card`, `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible` |
| Empty | `Empty` |
| Menus | `DropdownMenu`, `ContextMenu`, `Menubar` |
| Info | `Tooltip`, `HoverCard`, `Popover` |

## `npx shadcn@latest info` fields (use real values from JSON)

- **aliases** — never hardcode `@/` if the project uses another prefix.
- **isRSC** — if `true`, client hooks/events need `"use client"`.
- **tailwindVersion** — v4 vs v3 affects where theme tokens live.
- **tailwindCssFile** — edit the project’s global CSS for variables; do not invent a second globals file.
- **style**, **base** (`radix` vs `base`), **iconLibrary**, **resolvedPaths**, **framework**, **packageManager** — follow these for installs and imports.

## Docs and workflow

1. **Refresh context** — `npx shadcn@latest info --json` when unsure.
2. **Check installed components** — list `resolvedPaths.ui` or the `components` list from `info`; do not import missing components.
3. **Discover** — `npx shadcn@latest search`.
4. **Docs** — `npx shadcn@latest docs <component>` then open/fetch the URLs (do not guess APIs).
5. **Preview updates** — `add <c> --dry-run` and `--diff` before overwriting local tweaks.
6. **After add from third-party registries** — fix hardcoded `@/components/ui/...` imports to match this project’s aliases from `info`.
7. **Registry must be explicit** — if the user did not name a registry for a block, ask which registry to use; do not assume.
8. **Presets** — confirm **overwrite**, **partial** (`--only theme,font`), **merge**, or **skip** before destructive `apply` / `init --force`.

## Updating components

Use the CLI only (not raw GitHub files):

1. `npx shadcn@latest add <component> --dry-run`
2. Per file: `npx shadcn@latest add <component> --diff <file>`
3. Merge upstream with local changes; **never use `--overwrite` without explicit user approval.**

## Quick CLI reference

```bash
npx shadcn@latest init --preset base-nova
npx shadcn@latest apply --preset <code>
npx shadcn@latest add button card dialog
npx shadcn@latest add button --dry-run
npx shadcn@latest add button --diff button.tsx
npx shadcn@latest search @shadcn -q "sidebar"
npx shadcn@latest docs button dialog select
npx shadcn@latest view @shadcn/button
```

**Named presets:** nova, vega, maia, lyra, mira, luma. **Templates:** next, vite, start, react-router, astro (+ monorepo where supported), laravel (no monorepo). **Preset codes:** from https://ui.shadcn.com — pass through the CLI, do not decode manually.
