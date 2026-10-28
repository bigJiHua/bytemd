import * as bytemd from 'bytemd'
import React, { useEffect, useRef } from 'react'

export interface EditorProps extends bytemd.EditorProps {
  onChange?(value: string): void
}

export const Editor: React.FC<EditorProps> = ({
  onChange,
  layoutContainment = false,
  ...props
}) => {
  const ed = useRef<bytemd.Editor>()
  const el = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef<EditorProps['onChange']>()

  useEffect(() => {
    if (!el.current) return

    const editor = new bytemd.Editor({
      target: el.current,
      props: { ...props, layoutContainment },
    })
    editor.$on('change', (e: CustomEvent<{ value: string }>) => {
      onChangeRef.current?.(e.detail.value)
    })
    ed.current = editor

    return () => {
      editor.$destroy()
    }
  }, [])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    // TODO: performance
    ed.current?.$set({ ...props, layoutContainment })
  }, [props, layoutContainment])

  return <div ref={el}></div>
}
