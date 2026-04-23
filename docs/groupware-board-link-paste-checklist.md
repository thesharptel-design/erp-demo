# Groupware board link paste checklist

Use this quick checklist when validating link-preserving paste behavior in the board editor.

## Preconditions

- Sign in with a user account that can write board posts.
- Open `/groupware/board/new`.
- Use normal paste (`Ctrl+V`), not plain-text paste (`Ctrl+Shift+V`).

## Quick test cases

1. **Web page anchor text**
   - Copy linked text from a web page.
   - Paste into board body editor.
   - Expected: pasted text remains clickable (`<a href=...>`).

2. **PDF linked text**
   - Copy linked text from a PDF viewer.
   - Paste into board body editor.
   - Expected: depends on viewer; link may or may not remain.

3. **Image or screenshot source**
   - Copy text from an image/screenshot tool.
   - Paste into board body editor.
   - Expected: text only (or image), no link metadata.

4. **Plain-text forced paste**
   - Copy linked text from web page.
   - Paste with `Ctrl+Shift+V`.
   - Expected: text only, no link.

## Pass criteria

- At least case #1 preserves link correctly.
- Cases #2-#4 degrade safely to plain text without editor errors.
