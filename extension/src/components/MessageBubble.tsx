import { useState } from 'react'
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
  annotations?: any[]
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export type { Message, Attachment }

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const [isExpanded, setIsExpanded] = useState(false)

  // Pre-process citations/annotations in content to turn inline markers like 【5:4†source】 into clickable markdown links
  let renderedContent = message.content || ''
  const uniqueAnnotations: any[] = []

  if (message.annotations && message.annotations.length > 0) {
    // 1. Build a list of unique citations to assign stable indices (1, 2, 3...)
    message.annotations.forEach((ann: any) => {
      if (ann.url) {
        const exists = uniqueAnnotations.some(u => 
          (u.type === 'url_citation' && u.url === ann.url) ||
          (u.type !== 'url_citation' && u.filename === ann.filename)
        )
        if (!exists) {
          uniqueAnnotations.push(ann)
        }
      }
    })
    
    // 2. Sequential regex replacement of markers like 【5:0†source】
    // Match any pattern like 【digits:digits†source】 or 【digits†source】
    const markerRegex = /【\d+(?::\d+)?†source】/g
    let matchIndex = 0
    
    renderedContent = renderedContent.replace(markerRegex, () => {
      const ann = message.annotations![matchIndex++]
      if (!ann || !ann.url) return '' // Remove raw marker if no matching annotation is found
      
      const uniqueIdx = uniqueAnnotations.findIndex(u => 
        (u.type === 'url_citation' && u.url === ann.url) ||
        (u.type !== 'url_citation' && u.filename === ann.filename)
      )
      
      const citeNum = uniqueIdx !== -1 ? uniqueIdx + 1 : matchIndex
      // Return the markdown link styled as a nice numbered bracket [1], [2], etc.
      return `[[${citeNum}]](${ann.url})`
    })
  }

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
                    code: ({ node, ...props }) => <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-xs text-rose-600 dark:text-rose-400 border border-black/5 dark:border-white/5" {...props} />,
                    a: ({ node, ...props }) => <a className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold transition-colors" target="_blank" rel="noopener noreferrer" {...props} />
                  }}
                >
                  {renderedContent}
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

            {/* Render Citations / Sources Used (Azure UI Style with Show More/Less) */}
            {uniqueAnnotations.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-900/50">
                <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 tracking-wider uppercase mb-2">
                  Sources & Citations
                </div>
                <div className="space-y-1.5">
                  {(isExpanded ? uniqueAnnotations : uniqueAnnotations.slice(0, 1)).map((ann: any, idx: number) => {
                    const isUrl = ann.type === 'url_citation';
                    let displayTitle = ann.title || ann.url;
                    
                    // Format nice title for URLs/files
                    if (ann.url) {
                      try {
                        const urlObj = new URL(ann.url);
                        if (urlObj.pathname.endsWith('.md')) {
                          const parts = urlObj.pathname.split('/');
                          displayTitle = parts[parts.length - 1]
                            .replace('.md', '')
                            .split('_')
                            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(' ');
                        } else {
                          displayTitle = ann.title || urlObj.hostname.replace('www.', '');
                        }
                      } catch {
                        displayTitle = ann.title || ann.url;
                      }
                    }
                    
                    return (
                      <a
                        key={idx}
                        href={ann.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 rounded-lg bg-gray-50/50 dark:bg-gray-900/30 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10 border border-black/5 dark:border-white/5 transition-all text-xs group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Number badge */}
                          <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-semibold font-mono text-[10px] group-hover:bg-emerald-100 group-hover:text-emerald-700 dark:group-hover:bg-emerald-950/50 dark:group-hover:text-emerald-400 transition-colors">
                            {idx + 1}
                          </span>
                          {/* Icon & Title */}
                          <span className="text-gray-400 dark:text-gray-500 group-hover:text-emerald-500 transition-colors shrink-0">
                            {isUrl ? '🌐' : '📄'}
                          </span>
                          <span className="font-medium text-gray-700 dark:text-gray-300 truncate group-hover:text-emerald-900 dark:group-hover:text-emerald-300 transition-colors">
                            {displayTitle}
                          </span>
                        </div>
                        {/* URL snippet on the right */}
                        {ann.url && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[200px] ml-4 font-mono font-light group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {ann.url}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
                
                {/* Show More / Show Less Button */}
                {uniqueAnnotations.length > 1 && (
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md transition-all cursor-pointer"
                    >
                      {isExpanded ? 'Show less' : `Show more (+${uniqueAnnotations.length - 1})`}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-2">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
