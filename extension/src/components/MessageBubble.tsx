import React, { useState } from 'react'
import { 
  HiPaperClip,
  HiOutlineClipboard,
  HiCheck,
  HiOutlineInformationCircle
} from 'react-icons/hi2'
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
  isAgentProgress?: boolean
  progressEvents?: any[]
  citationMap?: Record<string, string>  // '1' -> 'aadhar.pdf', '2' -> 'voter.pdf', etc.
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export type { Message, Attachment }

// ─── Citation Badge ───────────────────────────────────────────────────────────
function CitationBadge({ num, filename, onClick }: { num: string; filename: string; onClick: (num: string) => void }) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative inline-block align-super ml-0.5">
      <button
        id={`citation-badge-${num}`}
        onClick={() => { setVisible(v => !v); onClick(num) }}
        onBlur={() => setTimeout(() => setVisible(false), 150)}
        className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded text-[10px] font-bold font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700/60 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 transition-all cursor-pointer select-none leading-none"
        title={`Source: ${filename}`}
      >
        {num}
      </button>
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 whitespace-nowrap">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-900 dark:bg-zinc-800 text-white text-[10px] font-medium shadow-lg border border-white/10">
            <span className="text-emerald-400">📄</span>
            {filename}
          </span>
          <span className="block w-2 h-2 bg-gray-900 dark:bg-zinc-800 rotate-45 mx-auto -mt-1 border-r border-b border-white/10" />
        </span>
      )}
    </span>
  )
}

// Parse text with [N] citation markers and return a React node array
function parseCitedContent(
  text: string,
  citationMap: Record<string, string>,
  onCitationClick: (num: string) => void
): React.ReactNode[] {
  // Split on [N] markers (1-2 digit numbers only to avoid matching markdown lists)
  const parts = text.split(/(\[\d{1,2}\])/g)
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d{1,2})\]$/)
    if (match) {
      const num = match[1]
      const filename = citationMap[num]
      if (filename) {
        return <CitationBadge key={i} num={num} filename={filename} onClick={onCitationClick} />
      }
    }
    return part
  })
}

interface ParsedField {
  index: string
  label: string
  value: string
  citationNum?: string
  reasoning?: string
}

function parseFieldLine(line: string): ParsedField | null {
  // Match lines like: "1. Field Name: Field Value [1]" or "5. Age: 24 [Calculated from DOB 01-01-2002 and today's date 14 June 2026]"
  const match = line.match(/^\s*(\d+)\.\s*([^:]+):\s*(.*)$/)
  if (!match) return null

  const index = match[1]
  const label = match[2].trim()
  let rawValue = match[3].trim()

  let citationNum: string | undefined
  let reasoning: string | undefined

  // 1. Extract citation marker at the end, e.g. "John Smith [1]" -> citationNum = "1"
  const citationMatch = rawValue.match(/\s*\[(\d+)\]\s*$/)
  if (citationMatch) {
    citationNum = citationMatch[1]
    rawValue = rawValue.slice(0, citationMatch.index).trim()
  }

  // 2. Extract calculation / reasoning in brackets if present, e.g. "[Calculated from DOB ...]"
  const reasoningMatch = rawValue.match(/\[(Calculated[^[\]]*|calculated[^[\]]*|Reasoning[^[\]]*)\]/)
  if (reasoningMatch) {
    reasoning = reasoningMatch[1]
    rawValue = (rawValue.substring(0, reasoningMatch.index!) + rawValue.substring(reasoningMatch.index! + reasoningMatch[0].length)).trim()
  }
  
  // Double check if there is another citation that was before reasoning (e.g. Value [1] [Calculated ...])
  if (!citationNum) {
    const innerCitationMatch = rawValue.match(/\s*\[(\d+)\]\s*$/)
    if (innerCitationMatch) {
      citationNum = innerCitationMatch[1]
      rawValue = rawValue.slice(0, innerCitationMatch.index).trim()
    }
  }

  return {
    index,
    label,
    value: rawValue,
    citationNum,
    reasoning
  }
}

function InlineFieldRow({
  field,
  citationMap,
  onCitationClick,
  isHighlighted
}: {
  field: ParsedField
  citationMap: Record<string, string>
  onCitationClick: (num: string) => void
  isHighlighted: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(field.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }

  return (
    <div
      className={`py-0.5 flex items-baseline flex-wrap gap-x-1.5 transition-colors rounded ${
        isHighlighted ? 'bg-emerald-500/10 px-1.5 -mx-1.5' : ''
      }`}
    >
      <span className="font-semibold text-gray-800 dark:text-zinc-200">
        {field.index}. {field.label}:
      </span>

      {field.reasoning && (
        <span className="relative inline-flex items-center align-middle">
          <button
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={() => setShowTooltip(prev => !prev)}
            className="text-gray-400 dark:text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-help transition-colors flex items-center"
            aria-label="Reasoning details"
          >
            <HiOutlineInformationCircle className="w-3.5 h-3.5" />
          </button>
          {showTooltip && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-52 p-2 rounded bg-gray-900 dark:bg-zinc-800 text-white text-[10px] font-medium leading-normal shadow-lg border border-white/10 text-center">
              {field.reasoning}
              <span className="block w-2 h-2 bg-gray-900 dark:bg-zinc-800 rotate-45 mx-auto -mt-1 border-r border-b border-white/10 absolute top-full left-1/2 -translate-x-1/2" />
            </span>
          )}
        </span>
      )}

      <span className="text-gray-900 dark:text-zinc-100 font-medium select-all">
        {field.value}
      </span>

      {field.citationNum && citationMap[field.citationNum] && (
        <CitationBadge
          num={field.citationNum}
          filename={citationMap[field.citationNum]}
          onClick={onCitationClick}
        />
      )}

      <button
        onClick={handleCopy}
        className={`inline-flex items-center justify-center p-0.5 rounded transition-all duration-150 cursor-pointer ${
          copied
            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
            : 'text-gray-400 dark:text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-150 dark:hover:bg-zinc-800'
        }`}
        title={copied ? "Copied!" : `Copy value: ${field.value}`}
      >
        {copied ? (
          <HiCheck className="w-3 h-3" />
        ) : (
          <HiOutlineClipboard className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  )
}

export default function MessageBubble({ message }: { message: Message }) {
  if (message.isAgentProgress) {
    return (
      <div className="w-full py-4 border-b border-gray-100 dark:border-gray-900/50 last:border-0 animate-in fade-in duration-250">
        <div className="flex gap-3.5 items-start w-full">
          {/* Assistant Avatar */}
          <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mt-0.5 shadow-inner">
            <RiRobot2Line className="w-4 h-4 animate-pulse" />
          </div>
          {/* Stepper Content */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tracking-wider uppercase mb-1.5">
              Form Mitra (Local Agent Workflow)
            </div>
            
            <AgentProgressStepper progressEvents={message.progressEvents} />
            
          </div>
        </div>
      </div>
    )
  }

  const isUser = message.role === 'user'
  const [isExpanded, setIsExpanded] = useState(false)
  const [highlightedCitation, setHighlightedCitation] = useState<string | null>(null)

  const handleCitationClick = (num: string) => {
    setHighlightedCitation(prev => prev === num ? null : num)
    // Scroll the corresponding attachment chip into view
    const el = document.getElementById(`attachment-chip-${message.id}-${num}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }


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
                    <a key={i} href={f.dataUrl} download={f.name} title="Download image" className="block group relative rounded-lg overflow-hidden border border-black/10 dark:border-white/10 shadow-sm max-w-[200px]">
                      <img src={f.dataUrl} alt={f.name} className="w-full h-auto object-cover max-h-32 group-hover:opacity-85 transition-opacity" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-white font-medium">Download</span>
                      </div>
                    </a>
                  )
                }
                return (
                  <a key={i} href={f.dataUrl} download={f.name} title="Download file" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-900 border border-black/5 dark:border-white/5 text-xs text-gray-600 dark:text-gray-300 hover:bg-emerald-500/10 dark:hover:bg-emerald-400/10 transition-colors">
                    <HiPaperClip className="w-3.5 h-3.5" />
                    <span className="max-w-[120px] truncate font-medium">{f.name}</span>
                    {f.size !== undefined && <span className="text-gray-400 dark:text-gray-500">{fmt(f.size)}</span>}
                  </a>
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
            <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-450 tracking-wider uppercase mb-1.5">
              Form Mitra
            </div>
            {message.progressEvents && message.progressEvents.length > 0 && !message.isAgentProgress && (
              <CollapsibleProgress progressEvents={message.progressEvents} />
            )}
            <div className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
              {message.content ? (
                message.citationMap && Object.keys(message.citationMap).length > 0 ? (
                  // Render with copyable fields when citationMap is available
                  <div className="space-y-0.5 mt-1">
                    {message.content.split('\n').map((line, lineIdx) => {
                      const parsed = parseFieldLine(line)
                      if (parsed) {
                        return (
                          <InlineFieldRow
                            key={lineIdx}
                            field={parsed}
                            citationMap={message.citationMap!}
                            onCitationClick={handleCitationClick}
                            isHighlighted={highlightedCitation !== null && highlightedCitation === parsed.citationNum}
                          />
                        )
                      }
                      // Fallback for non-field lines
                      return (
                        <div key={lineIdx} className="leading-relaxed">
                          {parseCitedContent(line, message.citationMap!, handleCitationClick)}
                        </div>
                      )
                    })}
                  </div>
                ) : (
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
                )
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
            {/* Render Assistant Attachments with numbered citation IDs */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3.5 max-w-[85%]">
                {message.attachments.map((f, i) => {
                  // Find which citation number this attachment corresponds to
                  const citNum = message.citationMap
                    ? Object.entries(message.citationMap).find(([, fname]) => fname === f.name)?.[0]
                    : undefined
                  const isHighlighted = highlightedCitation !== null && highlightedCitation === citNum
                  const isImage = f.name.endsWith('.png') || f.name.endsWith('.jpg') || f.name.endsWith('.jpeg') || f.dataUrl?.startsWith('data:image/');
                  if (isImage && f.dataUrl) {
                    return (
                      <div
                        key={i}
                        id={citNum ? `attachment-chip-${message.id}-${citNum}` : undefined}
                        className={`block group relative rounded-lg overflow-hidden border shadow-sm max-w-[200px] transition-all ${
                          isHighlighted ? 'border-emerald-400 ring-2 ring-emerald-400/40 scale-[1.02]' : 'border-black/10 dark:border-white/10'
                        }`}
                      >
                        {citNum && (
                          <span className="absolute top-1 left-1 z-10 inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-100/90 dark:bg-emerald-900/80 border border-emerald-300 dark:border-emerald-700">
                            {citNum}
                          </span>
                        )}
                        <a href={f.dataUrl} download={f.name} title="Download image">
                          <img src={f.dataUrl} alt={f.name} className="w-full h-auto object-cover max-h-32 group-hover:opacity-85 transition-opacity" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[10px] text-white font-medium">Download</span>
                          </div>
                        </a>
                      </div>
                    )
                  }
                  return (
                    <a
                      key={i}
                      id={citNum ? `attachment-chip-${message.id}-${citNum}` : undefined}
                      href={f.dataUrl} download={f.name} title="Download file"
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                        isHighlighted
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-400 ring-2 ring-emerald-400/30 text-emerald-800 dark:text-emerald-200'
                          : 'bg-gray-100 dark:bg-gray-900 border-black/5 dark:border-white/5 text-gray-600 dark:text-gray-300 hover:bg-emerald-500/10 dark:hover:bg-emerald-400/10'
                      }`}
                    >
                      {citNum && (
                        <span className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700">
                          {citNum}
                        </span>
                      )}
                      <HiPaperClip className="w-3.5 h-3.5" />
                      <span className="max-w-[120px] truncate font-medium">{f.name}</span>
                      {f.size !== undefined && <span className="text-gray-400 dark:text-gray-500">{fmt(f.size)}</span>}
                    </a>
                  )
                })}
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

interface OCRFileState {
  filename: string
  status: 'pending' | 'running' | 'done'
  preview?: string
}

interface ToolState {
  action: string
  filename: string
  targetFormat?: string
  status: 'pending' | 'running' | 'done' | 'failed'
  newFilename?: string
}

interface AttemptState {
  attempt: number
  planning: 'pending' | 'running' | 'done'
  actions?: any[]
  execution: 'pending' | 'running' | 'done'
  tools: ToolState[]
  formatting: 'pending' | 'running' | 'done'
  verification: 'pending' | 'running' | 'done' | 'failed'
  feedback?: string
}

interface DevStepProps {
  thought: string
  triggerText: string
  status?: 'running' | 'done' | 'failed' | 'pending'
  children: React.ReactNode
}

function DevStep({ thought, triggerText, status = 'done', children }: DevStepProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  const getStatusIndicator = () => {
    if (status === 'running') {
      return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
    }
    if (status === 'failed') {
      return <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
    }
    if (status === 'done') {
      return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
    }
    return <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-zinc-700" />
  }

  return (
    <div className="relative pl-6 pb-4 last:pb-1">
      {/* Timeline dot */}
      <div className="absolute -left-[9px] top-[5px] flex items-center justify-center w-2.5 h-2.5 rounded-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800">
        {getStatusIndicator()}
      </div>
      
      {/* Agent Thought */}
      <div className="text-[12px] font-sans text-gray-750 dark:text-zinc-300 leading-relaxed font-normal mb-1.5 select-text">
        {thought}
      </div>
      
      {/* Collapsible Action Block */}
      <div className="inline-block max-w-full">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 font-mono text-[10px] text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 px-2 py-0.5 rounded bg-gray-50/60 dark:bg-zinc-900/40 border border-gray-200/60 dark:border-zinc-800/60 transition-all cursor-pointer select-none"
        >
          <span className={`inline-block transition-transform duration-150 text-[7px] ${isOpen ? 'rotate-90' : 'rotate-0'}`}>
            ▶
          </span>
          <span>{triggerText}</span>
          {status === 'running' && <span className="text-[8px] text-emerald-500 animate-pulse font-sans ml-1">(running)</span>}
          {status === 'failed' && <span className="text-[8px] text-rose-500 font-sans ml-1">(failed)</span>}
        </button>
        
        {isOpen && (
          <div className="mt-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-850 text-zinc-300 font-mono text-[10px] overflow-x-auto max-w-full leading-normal select-text shadow-inner">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

function AgentProgressStepper({ progressEvents }: { progressEvents?: any[] }) {
  const events = progressEvents || []
  
  if (events.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
        <span>Initializing local agent workflow...</span>
      </div>
    )
  }

  // 1. Compile OCR files
  const ocrFiles: OCRFileState[] = []
  events.forEach((ev: any) => {
    if (ev.type === 'ocr_start') {
      const idx = ocrFiles.findIndex(f => f.filename === ev.filename)
      if (idx === -1) {
        ocrFiles.push({ filename: ev.filename, status: 'running' })
      } else {
        ocrFiles[idx].status = 'running'
      }
    } else if (ev.type === 'ocr_end') {
      const idx = ocrFiles.findIndex(f => f.filename === ev.filename)
      if (idx === -1) {
        ocrFiles.push({ filename: ev.filename, status: 'done', preview: ev.text_preview })
      } else {
        ocrFiles[idx].status = 'done'
        ocrFiles[idx].preview = ev.text_preview
      }
    }
  })

  // 2. Compile Attempts
  const attempts: AttemptState[] = []
  events.forEach((ev: any) => {
    const attemptNum = ev.attempt
    if (!attemptNum) return

    let attempt = attempts.find(a => a.attempt === attemptNum)
    if (!attempt) {
      attempt = {
        attempt: attemptNum,
        planning: 'pending',
        execution: 'pending',
        tools: [],
        formatting: 'pending',
        verification: 'pending',
      }
      attempts.push(attempt)
    }

    if (ev.type === 'planning_start') {
      attempt.planning = 'running'
    } else if (ev.type === 'planning_end') {
      attempt.planning = 'done'
      attempt.actions = ev.actions
    } else if (ev.type === 'execution_start') {
      attempt.execution = 'running'
    } else if (ev.type === 'tool_start') {
      attempt.tools.push({
        action: ev.action,
        filename: ev.filename,
        targetFormat: ev.target_format,
        status: 'running'
      })
    } else if (ev.type === 'tool_end') {
      const t = attempt.tools.find(tool => tool.filename === ev.filename && tool.action === ev.action)
      if (t) {
        t.status = ev.success ? 'done' : 'failed'
        t.newFilename = ev.new_filename
      } else {
        attempt.tools.push({
          action: ev.action,
          filename: ev.filename,
          status: ev.success ? 'done' : 'failed',
          newFilename: ev.new_filename
        })
      }
    } else if (ev.type === 'execution_end') {
      attempt.execution = 'done'
    } else if (ev.type === 'formatting_start') {
      attempt.formatting = 'running'
    } else if (ev.type === 'formatting_end') {
      attempt.formatting = 'done'
    } else if (ev.type === 'verification_start') {
      attempt.verification = 'running'
    } else if (ev.type === 'verification_end') {
      attempt.verification = ev.is_valid ? 'done' : 'failed'
      attempt.feedback = ev.feedback
    }
  })

  return (
    <div className="mt-3 relative pl-1 border-l border-gray-200 dark:border-zinc-800 ml-2 space-y-1">
      {/* 1. OCR Extraction */}
      {ocrFiles.length > 0 && (
        <DevStep
          thought="I will inspect the uploaded files and extract their contents using OCR to read them."
          triggerText={`Explored ${ocrFiles.length} file${ocrFiles.length > 1 ? 's' : ''}`}
          status={ocrFiles.some(f => f.status === 'running') ? 'running' : 'done'}
        >
          <pre className="whitespace-pre-wrap leading-relaxed">
            {JSON.stringify(ocrFiles.map(f => ({
              filename: f.filename,
              status: f.status,
              extracted_text_preview: f.preview || (f.status === 'running' ? 'extracting...' : 'no text extracted')
            })), null, 2)}
          </pre>
        </DevStep>
      )}

      {/* 2. Attempts Stepper */}
      {attempts.map((att) => (
        <React.Fragment key={att.attempt}>
          {/* Planning */}
          {(att.planning === 'running' || att.planning === 'done') && (
            <DevStep
              thought={`I will analyze the document requirements and plan formatting or compression actions for attempt ${att.attempt}.`}
              triggerText={`Planned ${att.actions?.length || 0} action${(att.actions?.length || 0) !== 1 ? 's' : ''}`}
              status={att.planning}
            >
              <pre className="whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(att.actions || [], null, 2)}
              </pre>
            </DevStep>
          )}

          {/* Tools executions */}
          {att.tools.map((t, idx) => {
            let thoughtText = ""
            let toolName = ""
            let params: any = {}
            let result: any = {}
            
            if (t.action === 'convert') {
              thoughtText = `I will convert ${t.filename} to ${t.targetFormat || 'PDF'} format.`
              toolName = "convert_document_tool"
              params = { file_path: t.filename, target_format: t.targetFormat || 'pdf' }
              result = t.status === 'done' ? { success: true, new_file: t.newFilename || `${t.filename.split('.')[0]}.pdf` } : { success: false }
            } else if (t.action === 'compress') {
              thoughtText = `I will compress ${t.filename} to reduce its size below the maximum limit.`
              toolName = "compress_document_tool"
              params = { file_path: t.filename }
              result = t.status === 'done' ? { success: true, new_file: t.newFilename || `${t.filename.split('.')[0]}_compressed.${t.filename.split('.').pop()}` } : { success: false }
            } else {
              thoughtText = `I will verify that ${t.filename} meets all size and format requirements.`
              toolName = "verify_requirements"
              params = { file_path: t.filename }
              result = { success: true, reason: "No conversions or compressions required." }
            }
            
            return (
              <DevStep
                key={idx}
                thought={thoughtText}
                triggerText={`Executed ${toolName}`}
                status={t.status}
              >
                <pre className="whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify({
                    tool: toolName,
                    arguments: params,
                    result: result
                  }, null, 2)}
                </pre>
              </DevStep>
            )
          })}

          {/* Formatting response */}
          {(att.formatting === 'running' || att.formatting === 'done') && (
            <DevStep
              thought="I will compile and format the extracted fields from the processed documents."
              triggerText="Formatted final response"
              status={att.formatting}
            >
              <div className="font-sans whitespace-pre-wrap text-[11px] leading-relaxed">
                {att.formatting === 'running' 
                  ? 'Generating extracted fields...' 
                  : 'Extracted fields formatted successfully.'}
              </div>
            </DevStep>
          )}

          {/* Verification */}
          {(att.verification === 'running' || att.verification === 'done' || att.verification === 'failed') && (
            <DevStep
              thought="I will check the compliance of the final documents and response fields."
              triggerText={`Verification ${att.verification === 'done' ? 'passed' : att.verification === 'failed' ? 'failed' : 'running'}`}
              status={att.verification === 'done' ? 'done' : att.verification === 'failed' ? 'failed' : 'running'}
            >
              <pre className="whitespace-pre-wrap leading-relaxed">
                {JSON.stringify({
                  is_valid: att.verification === 'done',
                  feedback: att.feedback || null
                }, null, 2)}
              </pre>
            </DevStep>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

function CollapsibleProgress({ progressEvents }: { progressEvents: any[] }) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className="mb-3 border border-black/5 dark:border-white/5 rounded-xl bg-gray-50/40 dark:bg-gray-900/20 overflow-hidden animate-in fade-in duration-200">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-left text-xs font-semibold text-gray-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-1.5">
          <RiRobot2Line className="w-3.5 h-3.5 text-emerald-500" />
          <span>View Document Processing Steps</span>
        </div>
        <span className="text-[10px] text-gray-400 dark:text-zinc-500 font-mono">
          {isOpen ? 'Collapse ▲' : 'Expand ▼'}
        </span>
      </button>
      
      {isOpen && (
        <div className="p-3 border-t border-black/5 dark:border-white/5 bg-white/50 dark:bg-black/20">
          <AgentProgressStepper progressEvents={progressEvents} />
        </div>
      )}
    </div>
  )
}
