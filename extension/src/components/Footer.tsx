import { useRef } from 'react'
import { HiPaperClip, HiXMark } from 'react-icons/hi2'
import { IoSend } from 'react-icons/io5'
import type { Attachment } from './MessageBubble'

interface FooterProps {
  inputText: string
  attachedFiles: Attachment[]
  onInputChange: (text: string) => void
  onFilesChange: (files: Attachment[]) => void
  onSend: () => void
}

export default function Footer({ inputText, attachedFiles, onInputChange, onFilesChange, onSend }: FooterProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canSend = inputText.trim().length > 0 || attachedFiles.length > 0

  const handleInput = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).map(f => ({ name: f.name, size: f.size }))
    onFilesChange([...attachedFiles, ...files])
    e.target.value = ''
  }

  return (
    <footer className="shrink-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 pt-3 pb-4">
      {/* Unified Gemini-style Input Box */}
      <div className="flex flex-col bg-gray-100 dark:bg-zinc-800/80 border border-black/8 dark:border-white/12 rounded-[24px] focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:focus-within:ring-emerald-400/15 focus-within:bg-white dark:focus-within:bg-zinc-900 transition-all duration-200">
        
        {/* Text Input Area */}
        <textarea
          ref={textareaRef}
          id="message-input"
          rows={1}
          value={inputText}
          onChange={e => onInputChange(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask Form Mitra or upload documents…"
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-500 outline-none max-h-32 leading-relaxed"
        />

        {/* Attached Files Preview (Inside the input box) */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {attachedFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/20 dark:border-emerald-400/25 text-xs text-emerald-700 dark:text-emerald-350">
                <HiPaperClip className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[120px] font-medium">{file.name}</span>
                <button
                  onClick={() => onFilesChange(attachedFiles.filter((_, j) => j !== i))}
                  className="ml-0.5 p-0.5 rounded-full hover:bg-emerald-500/20 dark:hover:bg-emerald-405/20 text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer"
                  aria-label="Remove attachment"
                >
                  <HiXMark className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Action Row */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-black/5 dark:border-white/5">
          {/* File input / attach button on the left */}
          <div>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" onChange={handleFileChange} className="hidden" />
            <button
              id="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-gray-100 transition-all cursor-pointer"
            >
              <HiPaperClip className="w-5 h-5" />
            </button>
          </div>

          {/* Send button on the right */}
          <button
            id="send-btn"
            onClick={() => { onSend(); if (textareaRef.current) textareaRef.current.style.height = 'auto' }}
            disabled={!canSend}
            title="Send"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
              canSend
                ? 'bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-400 shadow-sm hover:scale-105 active:scale-95'
                : 'text-gray-400 dark:text-zinc-500 cursor-not-allowed'
            }`}
          >
            <IoSend className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Centered Gemini-style Disclaimer */}
      <p className="text-center text-[10px] text-gray-400 dark:text-zinc-500 mt-2 select-none">
        Form Mitra can make mistakes. Consider checking important information.
      </p>
    </footer>
  )
}
