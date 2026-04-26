import { Extension } from '@tiptap/core'

/**
 * Enter = same-block line break (`<br>`), Shift+Enter = new block (paragraph).
 * Lists, headings, code blocks, and table cells keep default Enter behavior.
 */
export const enterSoftLineBreak = Extension.create({
  name: 'enterSoftLineBreak',
  priority: 10000,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { editor } = this
        if (editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('listItem')) {
          return false
        }
        if (editor.isActive('heading')) return false
        if (editor.isActive('codeBlock')) return false
        if (editor.isActive('tableCell') || editor.isActive('tableHeader')) return false
        return editor.chain().focus().setHardBreak().run()
      },
      'Shift-Enter': () => this.editor.chain().focus().splitBlock().run(),
    }
  },
})
