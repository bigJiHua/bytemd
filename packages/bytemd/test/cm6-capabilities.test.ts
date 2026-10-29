import { createCodeMirror, createEditorUtils } from '../src/editor'
import Editor from '../src/editor.svelte'
import { undo } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import { render, act, cleanup } from '@testing-library/svelte'

afterEach(cleanup)

function codeMirror(result: ReturnType<typeof render>) {
  return (result.container.querySelector('.CodeMirror') as any).CodeMirror
}

function yamlNodes(host: Element, selector: string) {
  return [...host.querySelectorAll(selector)].map((node) => node.textContent)
}

test('yaml frontmatter is highlighted and the body stays untouched', async () => {
  const result = render(
    Editor,
    {
      value:
        '---\ntitle: "Hello World"\nnum: 42\nflag: true\nnote: # trailing\n---\n# Body',
    },
    { previewDebounce: 0 },
  )
  await act()
  const host = result.container.querySelector('.CodeMirror') as Element
  expect(yamlNodes(host, '.bytemd-yaml-key')).toEqual([
    'title',
    'num',
    'flag',
    'note',
  ])
  expect(yamlNodes(host, '.bytemd-yaml-string')).toEqual(['"Hello World"'])
  expect(yamlNodes(host, '.bytemd-yaml-number')).toEqual(['42'])
  expect(yamlNodes(host, '.bytemd-yaml-keyword')).toEqual(['true'])
  expect(yamlNodes(host, '.bytemd-yaml-comment')).toEqual(['# trailing'])
  // colons plus the two `---` fences
  const punct = yamlNodes(host, '.bytemd-yaml-punct')
  expect(punct.filter((text) => text === '---')).toHaveLength(2)
  expect(punct.filter((text) => text === ':')).toHaveLength(4)
  // the markdown body carries no frontmatter tokens
  const bodyLine = [...host.querySelectorAll('.cm-line')].find((line) =>
    line.textContent?.includes('# Body'),
  )
  expect(bodyLine).toBeTruthy()
  expect(bodyLine?.querySelector('[class*="bytemd-yaml-"]')).toBeNull()
})

test('unclosed frontmatter keeps highlighting until the document end', async () => {
  const result = render(Editor, { value: '---\ntitle: x\nplain body text' })
  await act()
  const host = result.container.querySelector('.CodeMirror') as Element
  expect(yamlNodes(host, '.bytemd-yaml-key')).toEqual(['title'])
  // only the opening fence is a delimiter
  expect(
    yamlNodes(host, '.bytemd-yaml-punct').filter((t) => t === '---'),
  ).toHaveLength(1)
})

test('a mid-document hr is not frontmatter', async () => {
  const result = render(Editor, { value: '# Hello\n---\nworld' })
  await act()
  const host = result.container.querySelector('.CodeMirror') as Element
  expect(host.querySelector('[class*="bytemd-yaml-"]')).toBeNull()
})

test('extraKeys Enter continues markdown lists', async () => {
  const result = render(Editor, { value: '- item' })
  await act()
  const editor = codeMirror(result)
  editor.setCursor({ line: 0, ch: 6 })
  editor.view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }),
  )
  expect(editor.getValue()).toBe('- item\n- ')
})

test('editorConfig readOnly blocks input and setOption can lift it', async () => {
  const result = render(Editor, {
    value: 'locked',
    editorConfig: { readOnly: true },
  })
  await act()
  const editor = codeMirror(result)
  expect(editor.view.state.facet(EditorState.readOnly)).toBe(true)
  // programmatic edits stay available, like CM5 readOnly
  editor.setValue('changed')
  expect(editor.getValue()).toBe('changed')
  editor.setOption('readOnly', false)
  expect(editor.view.state.facet(EditorState.readOnly)).toBe(false)
})

test('wrapping undoes in a single step and restores the selection', async () => {
  const result = render(Editor, { value: 'first\nsecond' })
  await act()
  const editor = codeMirror(result)
  const utils = createEditorUtils(createCodeMirror(), editor)
  editor.setSelection({ line: 0, ch: 0 }, { line: 1, ch: 6 })
  utils.wrapText('**')
  expect(editor.getValue()).toBe('**first\nsecond**')
  expect(editor.getSelection()).toBe('first\nsecond')
  undo(editor.view)
  expect(editor.getValue()).toBe('first\nsecond')
  expect(editor.getSelection()).toBe('first\nsecond')
})

test('appendBlock appends after a separator at the document end', async () => {
  const result = render(Editor, { value: 'A\nB' })
  await act()
  const editor = codeMirror(result)
  const pos = createEditorUtils(createCodeMirror(), editor).appendBlock('IMG')
  expect(editor.getValue()).toBe('A\nB\n\nIMG')
  expect(pos).toEqual({ line: 3, ch: 0 })
})

test('appendBlock fills the first blank line below the cursor', async () => {
  const result = render(Editor, { value: 'A\n\nB' })
  await act()
  const editor = codeMirror(result)
  const pos = createEditorUtils(createCodeMirror(), editor).appendBlock('IMG')
  expect(editor.getValue()).toBe('A\n\nIMG\nB')
  expect(pos).toEqual({ line: 2, ch: 0 })
})

test('appendBlock on an empty document returns the content position', async () => {
  const result = render(Editor, { value: '' })
  await act()
  const editor = codeMirror(result)
  const pos = createEditorUtils(createCodeMirror(), editor).appendBlock('IMG')
  expect(editor.getValue()).toBe('\nIMG')
  expect(pos).toEqual({ line: 1, ch: 0 })
})
