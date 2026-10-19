'use client'

import type { ReactNode } from 'react'
import { useId } from 'react'

import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'

import { FieldContext } from './field-context'

export interface FieldProps {
  readonly label: string
  readonly children: ReactNode
  readonly hint?: string
  readonly error?: string
  readonly required?: boolean
  readonly className?: string
}

export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  className,
}: FieldProps) {
  const id = useId()
  const controlId = `${id}-control`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  const describedBy: string[] = []
  if (hint !== undefined) describedBy.push(hintId)
  if (error !== undefined) describedBy.push(errorId)

  return (
    <div className={cx('flex flex-col gap-[7px]', className)}>
      <label className="text-sm font-semibold text-ink-2" htmlFor={controlId}>
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {'*'}
          </span>
        ) : null}
      </label>

      <FieldContext.Provider
        value={{
          controlId,
          describedBy: describedBy.length === 0 ? undefined : describedBy.join(' '),
          invalid: error !== undefined,
          required,
        }}
      >
        {children}
      </FieldContext.Provider>

      {hint === undefined ? null : (
        <p className="text-xs text-ink-3" id={hintId}>
          {hint}
        </p>
      )}

      {error === undefined ? null : (
        <p className="flex items-center gap-1 text-xs text-danger" id={errorId} role="alert">
          <Icon name="error" size="compact" />
          {error}
        </p>
      )}
    </div>
  )
}