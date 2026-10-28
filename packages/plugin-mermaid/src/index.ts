import { icons } from './icons'
import en from './locales/en.json'
import type { BytemdPlugin } from 'bytemd'
import type { default as Mermaid, MermaidConfig } from 'mermaid'

type Locale = {
  mermaid: string
  flowchart: string
  sequence: string
  class: string
  state: string
  er: string
  uj: string
  gantt: string
  pie: string
  mindmap: string
  timeline: string
}

let modulePromise: Promise<typeof Mermaid> | undefined
let renderQueue = Promise.resolve()
let diagramId = 0

function loadMermaid() {
  if (!modulePromise)
    modulePromise = import('mermaid')
      .then((module) => module.default)
      .catch((error) => {
        modulePromise = undefined
        throw error
      })
  return modulePromise
}

export interface BytemdPluginMermaidOptions extends MermaidConfig {
  locale?: Partial<Locale>
}

export default function mermaid({
  locale: _locale,
  ...mermaidConfig
}: BytemdPluginMermaidOptions = {}): BytemdPlugin {
  const locale = { ...en, ..._locale } as Locale

  const actionItems = [
    {
      title: locale.flowchart,
      code: `graph TD
Start --> Stop`,
    },
    {
      title: locale.sequence,
      code: `sequenceDiagram
Alice->>John: Hello John, how are you?
John-->>Alice: Great!
Alice-)John: See you later!`,
    },
    {
      title: locale.class,
      code: `classDiagram
Animal <|-- Duck
Animal <|-- Fish
Animal <|-- Zebra
Animal : +int age
Animal : +String gender
Animal: +isMammal()
Animal: +mate()
class Duck{
+String beakColor
+swim()
+quack()
}
class Fish{
-int sizeInFeet
-canEat()
}
class Zebra{
+bool is_wild
+run()
}`,
    },
    {
      title: locale.state,
      code: `stateDiagram-v2
[*] --> Still
Still --> [*]

Still --> Moving
Moving --> Still
Moving --> Crash
Crash --> [*]`,
    },
    {
      title: locale.er,
      code: `erDiagram
CUSTOMER ||--o{ ORDER : places
ORDER ||--|{ LINE-ITEM : contains
CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,
    },
    {
      title: locale.uj,
      code: `journey
title My working day
section Go to work
Make tea: 5: Me
Go upstairs: 3: Me
Do work: 1: Me, Cat
section Go home
Go downstairs: 5: Me
Sit down: 5: Me`,
    },
    {
      title: locale.gantt,
      code: `gantt
title A Gantt Diagram
dateFormat  YYYY-MM-DD
section Section
A task           :a1, 2014-01-01, 30d
Another task     :after a1  , 20d
section Another
Task in sec      :2014-01-12  , 12d
another task      : 24d`,
    },
    {
      title: locale.pie,
      code: `pie title Pets adopted by volunteers
"Dogs" : 386
"Cats" : 85
"Rats" : 15`,
    },
    {
      title: locale.mindmap,
      code: `mindmap
      Root
          A
            B
            C
    `,
    },
    {
      title: locale.timeline,
      code: `timeline
      title History of Social Media Platform
      2002 : LinkedIn
      2004 : Facebook
           : Google
      2005 : Youtube
      2006 : Twitter
      `,
    },
  ]

  return {
    viewerEffect({ markdownBody, reportError }) {
      let active = true
      const replacements: { pre: HTMLElement; container: HTMLElement }[] = []
      const stages = new Set<HTMLElement>()
      for (const el of markdownBody.querySelectorAll<HTMLElement>(
        'pre>code.language-mermaid'
      )) {
        const pre = el.parentElement!
        const source = el.textContent ?? ''
        const task = renderQueue.then(async () => {
          if (!active || !markdownBody.contains(pre)) return
          const m = await loadMermaid()
          if (!active || !markdownBody.contains(pre)) return
          // Mermaid's public renderer also queues work. Keep initialization
          // and the awaited render together so another Viewer cannot reset it.
          const previousConfig = m.mermaidAPI?.getConfig?.()
          m.initialize({
            ...mermaidConfig,
            startOnLoad: false,
            suppressErrorRendering: true,
          })
          const stage = markdownBody.ownerDocument.createElement('div')
          stage.style.cssText =
            'position:absolute;left:-10000px;visibility:hidden;pointer-events:none'
          const container = markdownBody.ownerDocument.createElement('div')
          container.className = 'bytemd-mermaid'
          container.style.lineHeight = 'initial'
          stage.appendChild(container)
          markdownBody.appendChild(stage)
          stages.add(stage)
          try {
            const result = await m.render(
              `bytemd-mermaid-${++diagramId}`,
              source,
              container
            )
            if (!active || !markdownBody.contains(pre)) return
            container.innerHTML = result.svg
            if (pre.dataset.bytemdBlock)
              container.dataset.bytemdBlock = pre.dataset.bytemdBlock
            pre.replaceWith(container)
            try {
              result.bindFunctions?.(container)
            } catch (error) {
              container.replaceWith(pre)
              throw error
            }
            replacements.push({ pre, container })
          } finally {
            stage.remove()
            stages.delete(stage)
            // initialize() mutates mermaid's module-global configuration;
            // restore the host snapshot so unrelated diagrams on the page
            // are not re-themed by the plugin.
            if (previousConfig) m.initialize(previousConfig)
          }
        })
        // A rejected diagram must not poison the shared queue.
        renderQueue = task.catch(() => {})
        task.catch((error) => {
          if (!active || !markdownBody.contains(pre)) return
          if (reportError)
            reportError(error, { plugin: 'Mermaid', element: pre })
          else console.error(error)
        })
      }
      return () => {
        active = false
        stages.forEach((stage) => stage.remove())
        stages.clear()
        // Svelte tracks the original {@html} nodes. Restore replaced nodes
        // before its next DOM update so the old diagram is actually removed.
        replacements.forEach(({ pre, container }) => container.replaceWith(pre))
      }
    },
    actions: [
      {
        title: locale.mermaid,
        icon: icons.ChartGraph,
        cheatsheet: '```mermaid',
        handler: {
          type: 'dropdown',
          actions: actionItems.map(({ title, code }) => ({
            title,
            handler: {
              type: 'action',
              click({ editor, appendBlock, codemirror }) {
                const { line } = appendBlock('```mermaid\n' + code + '\n```')
                editor.setSelection(
                  codemirror.Pos(line + 1, 0),
                  codemirror.Pos(line + code.split('\n').length)
                )
                editor.focus()
              },
            },
          })),
          ...locale,
        },
      },
    ],
  }
}
