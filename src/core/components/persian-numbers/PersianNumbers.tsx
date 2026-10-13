'use client'

import { useEffect } from 'react'

import { toPersianDigits } from '@/core/localization'

/**
 * کل اعداد انگلیسی صفحه را خودکار به فارسی تبدیل می‌کند.
 *
 * بدون دست زدن به فرم‌ها، ورودی‌ها، ایمیل‌ها، آدرس‌ها و کدها — فقط متن‌های
 * نمایشی. بعد از هر تغییر DOM دوباره اجرا می‌شود تا محتوای تازه را هم بگیرد.
 */

/** آیا این گره باید دست‌نخورده بماند؟ */
function shouldSkip(node: Node): boolean {
  const parent = node.parentElement
  if (parent === null) return true

  const tag = parent.tagName
  if (
    tag === 'SCRIPT' ||
    tag === 'STYLE' ||
    tag === 'CODE' ||
    tag === 'PRE' ||
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'OPTION'
  ) {
    return true
  }

  if (parent.closest('[dir="ltr"], [data-no-persian]')) return true
  if (parent.isContentEditable) return true

  return false
}

/** همه‌ی گره‌های متنی زیر یک ریشه را می‌گردد و اعدادشان را فارسی می‌کند. */
function walk(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkip(node)) return NodeFilter.FILTER_REJECT
      const text = node.nodeValue
      if (text === null || !/[0-9]/.test(text)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const targets: Text[] = []
  let current = walker.nextNode()
  while (current !== null) {
    targets.push(current as Text)
    current = walker.nextNode()
  }

  for (const node of targets) {
    const next = toPersianDigits(node.nodeValue ?? '')
    if (next !== node.nodeValue) node.nodeValue = next
  }
}

export function PersianNumbers() {
  useEffect(() => {
    walk(document.body)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const node = mutation.target
          if (node.nodeType === Node.TEXT_NODE && !shouldSkip(node)) {
            const text = node.nodeValue ?? ''
            const next = toPersianDigits(text)
            if (next !== text) node.nodeValue = next
          }
        } else {
          mutation.addedNodes.forEach((added) => {
            if (added.nodeType === Node.TEXT_NODE) {
              const text = added.nodeValue ?? ''
              if (!shouldSkip(added)) {
                const next = toPersianDigits(text)
                if (next !== text) added.nodeValue = next
              }
            } else if (added.nodeType === Node.ELEMENT_NODE) {
              walk(added)
            }
          })
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => observer.disconnect()
  }, [])

  return null
}