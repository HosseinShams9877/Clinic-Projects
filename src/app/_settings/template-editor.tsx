/**
 * One message-template field, with its kind's own variable chips and a live preview.
 *
 * The field is a `textarea` a manager edits, a row of chips for the placeholders the
 * kind allows, and a one-line preview that substitutes each placeholder with a
 * sample value.
 *
 * ## Why it takes only `placeholders`
 *
 * The chips are the placeholders the kind allows, which the page reads from the
 * module's allow-list. The samples the preview substitutes and the label above the
 * preview line live in `@/app/_settings/catalog`, so the client has no `@/modules/*`
 * import to drag a `node:async_hooks` dependency into the bundle.
 *
 * ## Why it is a client component
 *
 * The chips insert into the textarea at the caret, which is a DOM operation; the
 * textarea's value is state so the preview can re-render on every keystroke. The
 * form it sits in still submits the same `template:<kind>:<channel>` field it did
 * before — the textarea keeps its `name`.
 */

'use client'

import { useRef, useState } from 'react'

import { CONTROL_CLASSES } from '@/core/components/form/control-classes'
import { cx } from '@/core/lib'
import { renderMessage, type MessageValue } from '@/core/localization'

import {
  TEMPLATE_EDITOR_PREVIEW_LABEL,
  TEMPLATE_EDITOR_SAMPLES,
} from './catalog'

export interface TemplateEditorProps {
  /** The form field's own name, `template:<kind>:<channel>`. */
  readonly name: string
  /** The label the tab renders above the field. */
  readonly label: string
  /** The starting text, which is the tenant's row or the shipped default. */
  readonly defaultValue: string
  /** The placeholder keys this kind allows. */
  readonly placeholders: readonly string[]
}

export function TemplateEditor({
  name,
  label,
  defaultValue,
  placeholders,
}: TemplateEditorProps) {
  const [text, setText] = useState(defaultValue)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  function insert(key: string) {
    const token = `{${key}}`
    const textarea = textareaRef.current
    if (textarea === null) {
      setText(text + token)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const next = text.slice(0, start) + token + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      textarea.focus()
      const caret = start + token.length
      textarea.setSelectionRange(caret, caret)
    })
  }

  const preview = renderPreview(text, placeholders)

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
      <span className="text-xs font-semibold text-ink-3">{label}</span>

      <textarea
        ref={textareaRef}
        name={name}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        className={cx(CONTROL_CLASSES, 'font-normal leading-relaxed')}
      />

      <div className="flex flex-wrap items-center gap-1">
        {placeholders.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => insert(key)}
            className={cx(
              'rounded-pill border border-line-2 bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2',
              'transition-colors hover:border-brand hover:text-brand-700',
            )}
          >
            {`{${key}}`}
          </button>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-ink-3">
        <span className="font-semibold text-ink-2">{TEMPLATE_EDITOR_PREVIEW_LABEL}</span>
        {preview}
      </p>
    </div>
  )
}

/**
 * The preview text: each placeholder in `text` substituted with its sample value.
 *
 * `renderMessage` raises on a placeholder with no value, so the values map is built
 * from the placeholders this kind allows — a key the kind allows is a key the map
 * holds, and one the kind does not allow never reaches the renderer.
 */
function renderPreview(text: string, placeholders: readonly string[]): string {
  const values: Record<string, MessageValue> = {}
  for (const key of placeholders) {
    values[key] = TEMPLATE_EDITOR_SAMPLES[key] ?? `{${key}}`
  }
  try {
    return renderMessage(text, values)
  } catch {
    return text
  }
}