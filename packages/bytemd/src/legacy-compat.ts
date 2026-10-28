import EditorComponent from './editor.svelte'
import type { EditorProps, ViewerProps } from './types'
import ViewerComponent from './viewer.svelte'
import { createClassComponent } from 'svelte/legacy'

/**
 * Svelte 5 bridge for the Svelte 3 class surface (`new`, `$set`, `$on`,
 * `$destroy`) that the React/Vue wrapper packages mount with. Keeping the
 * bridge inside this package guarantees the component and `svelte/legacy`
 * share one bundled runtime instead of requiring wrappers to depend on
 * Svelte themselves.
 */
type MountOptions<Props> = {
  target: HTMLElement | SVGElement | Document | ShadowRoot
  anchor?: Node
  props?: Props
  context?: Map<any, any>
  intro?: boolean
}

type LegacyInstance<Props> = {
  $set(props: Partial<Props>): void
  $on(event: string, handler: (event: CustomEvent<any>) => void): () => void
  $destroy(): void
}

function mountLegacy<Props>(
  component: unknown,
  options: MountOptions<Props>,
): LegacyInstance<Props> {
  return createClassComponent({
    ...options,
    component,
  } as any) as unknown as LegacyInstance<Props>
}

export class Editor {
  constructor(options: MountOptions<EditorProps>) {
    return mountLegacy(EditorComponent, options) as unknown as Editor
  }
}

export interface Editor extends LegacyInstance<EditorProps> {}

export class Viewer {
  constructor(options: MountOptions<ViewerProps>) {
    return mountLegacy(ViewerComponent, options) as unknown as Viewer
  }
}

export interface Viewer extends LegacyInstance<ViewerProps> {}

// Raw Svelte 5 component functions for hosts that render ByteMD inside their
// own Svelte 5 templates (`<EditorComponent />`); the compat classes above are
// for imperative mounts only (Svelte 5 templates cannot instantiate classes).
export { default as EditorComponent } from './editor.svelte'
export { default as ViewerComponent } from './viewer.svelte'
