import { HiPaperClip } from 'react-icons/hi2'
import { RiRobot2Line } from 'react-icons/ri'
import ReactMarkdown from 'react-markdown'

interface Attachment {
  name: string
  size?: number
  dataUrl?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  attachments?: Attachment[]
  timestamp: Date
  tool_call_id?: string
  tool_calls?: any[]
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
    <div className="w-full py-4 border-b border-gray-100 dark:border-gray-900/50 last:border-0">
      {isUser ? (
        <div className="flex flex-col items-end w-full space-y-2">
          {/* Render User Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end max-w-[85%]">
              {message.attachments.map((f, i) => {
                const isImage = f.name.endsWith('.png') || f.name.endsWith('.jpg') || f.name.endsWith('.jpeg') || f.dataUrl?.startsWith('data:image/');
                if (isImage && f.dataUrl) {
                  return (
                    <div key={i} className="rounded-lg overflow-hidden border border-black/10 dark:border-white/10 shadow-sm max-w-[200px]">
                      <img src={f.dataUrl} alt={f.name} className="w-full h-auto object-cover max-h-32" />
                    </div>
                  )
                }
                return (
                  <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-900 border border-black/5 dark:border-white/5 text-xs text-gray-600 dark:text-gray-300">
                    <HiPaperClip className="w-3.5 h-3.5" />
                    <span className="max-w-[120px] truncate font-medium">{f.name}</span>
                    {f.size !== undefined && <span className="text-gray-400 dark:text-gray-500">{fmt(f.size)}</span>}
                  </div>
                )
              })}
            </div>
          )}
          {/* User Query text */}
          <div className="max-w-[85%] text-right">
            <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 tracking-wider uppercase mb-1">
              You
            </div>
            <div className="text-gray-900 dark:text-gray-100 text-sm leading-relaxed whitespace-pre-wrap font-medium">
              {message.content}
            </div>
            <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-1">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-3.5 items-start w-full">
          {/* Assistant Avatar */}
          <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mt-0.5 shadow-inner">
            <RiRobot2Line className="w-4 h-4" />
          </div>
          {/* Assistant Text Content */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tracking-wider uppercase mb-1.5">
              Form Mitra
            </div>
            <div className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
              {message.content ? (
                <ReactMarkdown
                  components={{
                    p: ({ node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
                    li: ({ node, ...props }) => <li className="text-gray-700 dark:text-gray-300" {...props} />,
                    h1: ({ node, ...props }) => <h1 className="text-base font-bold mt-4 mb-2 text-gray-900 dark:text-white" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-sm font-bold mt-3.5 mb-1.5 text-gray-900 dark:text-white" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-xs font-bold mt-3 mb-1 text-gray-900 dark:text-white" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-semibold text-gray-950 dark:text-white" {...props} />,
                    code: ({ node, ...props }) => <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-xs text-rose-600 dark:text-rose-400 border border-black/5 dark:border-white/5" {...props} />
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : (
                <div className="flex gap-1 items-center h-4 mt-2">
                  {[0, 150, 300].map(delay => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 dark:bg-emerald-400/60 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-2">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
