import { HiPaperClip } from 'react-icons/hi2'
import { RiRobot2Line } from 'react-icons/ri'

interface Attachment {
  name: string
  size: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
  timestamp: Date
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export type { Message, Attachment }

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''} items-end`}>
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 dark:bg-emerald-400/20 border border-emerald-300/40 dark:border-emerald-500/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <RiRobot2Line className="w-4 h-4" />
        </div>
      )}
      <div className={`max-w-[82%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        {message.attachments?.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/60 dark:bg-white/10 border border-black/10 dark:border-white/15 text-xs text-gray-600 dark:text-gray-300">
            <HiPaperClip className="w-3.5 h-3.5" />
            <span className="max-w-[120px] truncate font-medium">{f.name}</span>
            <span className="text-gray-400 dark:text-gray-500">{fmt(f.size)}</span>
          </div>
        ))}
        <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
          isUser
            ? 'bg-emerald-600 dark:bg-emerald-500 text-white rounded-br-sm'
            : 'bg-white dark:bg-white/10 text-gray-800 dark:text-gray-100 border border-black/8 dark:border-white/12 rounded-bl-sm'
        }`}>
          {message.content}
        </div>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
