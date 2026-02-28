'use client';

import { UIMessage, useChat } from '@ai-sdk/react';
import * as Separator from '@radix-ui/react-separator';
import dynamic from 'next/dynamic'
import { ChatInput } from '@/components/ChatInput';
import { ThemeToggle } from '@/components/ThemeToggle';

const MessageList = dynamic(
  () => import('@/components/MessageList').then(m => m.MessageList),
  {
    ssr: false,
    loading: () => <div className="flex-1" />,
  }
)

const INITIAL_MESSAGES: UIMessage[] = [
	{
		id: '0',
		role: 'assistant',
		parts: [
			{
				type: 'text',
				text: 'Greetings, adventurer. I am the Grimoire Oracle — ask me anything about Old-School Essentials rules.',
			},
		],
	},
];

export default function Page() {
	const { messages, sendMessage, status, error } = useChat({
		messages: INITIAL_MESSAGES,
	});

	const handleSend = (text: string) => {
		sendMessage({
			id: crypto.randomUUID(),
			role: 'user',
			parts: [
				{
					type: 'text',
					text,
				},
			],
		});
	};

	return (
		<main className='flex flex-col h-screen bg-bg font-mono overflow-hidden'>
			{/* Header */}
			<header className='flex items-center justify-between px-4 py-3 shrink-0'>
				<div>
					<h1 className='font-mono font-bold text-lg bg-linear-to-r from-accent to-accent-2 bg-clip-text text-transparent'>
						GRIMOIRE ORACLE
					</h1>
					<p className='font-mono text-xs text-fg-subtle'>OSE rules lookup</p>
				</div>
				<ThemeToggle />
			</header>

			<Separator.Root className='h-px bg-bg-subtle shrink-0' />

			{/* Message list — fills remaining space */}
			<MessageList messages={messages} status={status} />

			<Separator.Root className='h-px bg-bg-subtle shrink-0' />

			{/* Input area */}
			<ChatInput onSubmit={handleSend} isDisabled={status !== 'ready'} />

			{/* Status bar */}
			<footer className='px-4 py-1 shrink-0'>
				{error ? (
					<p className='font-mono text-xs text-red-500'>{error.message}</p>
				) : (
					<p className='font-mono text-xs text-fg-subtle'>
						Enter to send · Shift+Enter for newline
					</p>
				)}
			</footer>
		</main>
	);
}
