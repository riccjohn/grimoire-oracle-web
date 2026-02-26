type Props = {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export function Message({ role, content, isStreaming = false }: Props) {
  const isUser = role === 'user'

  return (
    <div
      className={[
        'pl-3 py-1 mb-4 group transition-colors',
        isUser
          ? 'border-l-4 border-accent'
          : 'border-l-2 border-bg-subtle hover:border-accent',
      ].join(' ')}
    >
      <p className="font-mono text-xs text-fg-subtle mb-1 select-none">
        {isUser ? '> You' : '🧙 Oracle'}
      </p>
      <p className="font-mono text-sm text-fg whitespace-pre-wrap wrap-break-word">
        {content}
        {isStreaming && (
          <span className="animate-pulse text-accent-2 ml-0.5">█</span>
        )}
      </p>
    </div>
  )
}
