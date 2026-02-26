'use client'

import { useRef, useState } from 'react'

type Props = {
  onSubmit: (value: string) => void
  isDisabled?: boolean
}

export function ChatInput({ onSubmit, isDisabled = false }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || isDisabled) return
    onSubmit(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Auto-resize up to 5 rows
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 5 * 24)}px`
  }

  return (
    <div className="px-4 py-3 flex gap-2 items-end">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
        placeholder="Ask the oracle..."
        rows={1}
        className={[
          'flex-1 resize-none font-mono text-sm',
          'bg-bg-light border border-bg-subtle rounded',
          'text-fg placeholder:text-fg-subtle',
          'focus:outline-none focus:border-accent',
          'px-3 py-2 leading-6',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'caret-accent-2',
          'transition-colors',
        ].join(' ')}
        style={{ minHeight: '2.5rem' }}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isDisabled || !value.trim()}
        className={[
          'font-mono text-sm px-3 py-2 rounded',
          'bg-bg-light border border-bg-subtle',
          'text-accent hover:border-accent',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'transition-colors shrink-0',
        ].join(' ')}
      >
        ▶
      </button>
    </div>
  )
}
