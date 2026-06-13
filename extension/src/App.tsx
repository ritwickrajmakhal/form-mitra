import { useState, useRef, useEffect, useCallback } from 'react'
import Header from './components/Header'
import MessageBubble from './components/MessageBubble'
import Footer from './components/Footer'
import type { Message } from './components/MessageBubble'
import { stitchViewports } from './utils/screenshot'
import { HiCamera, HiTrash, HiXMark, HiOutlineDocumentText, HiDocumentArrowUp } from 'react-icons/hi2'

const WELCOME: Message = {
  id: '1',
  role: 'assistant',
  content: "Hello! I'm Form Mitra, your AI form-filling assistant. Let me help you analyze form fields and identify required documents.",
  timestamp: new Date(),
}

const API_BASE_URL = 'http://localhost:8000/api'

export default function App() {
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [isTyping, setIsTyping] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/sessions`)
      if (response.ok) {
        const data = await response.json()
        setSessions(data)
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleNewChat = () => {
    setSessionId(null)
    setMessages([{ ...WELCOME, id: Date.now().toString(), timestamp: new Date() }])
    setIsSidebarOpen(false)
  }

  const handleLoadSession = async (id: string) => {
    setIsSidebarOpen(false)
    setIsTyping(true)
    try {
      const response = await fetch(`${API_BASE_URL}/session/${id}`)
      if (response.ok) {
        const data = await response.json()
        setSessionId(data.session_id)
        
        // Map backend messages to local format
        const loadedMessages = data.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp),
          progressEvents: m.progress_events ? JSON.parse(m.progress_events) : undefined,
          citationMap: m.citation_map ? JSON.parse(m.citation_map) : undefined,
          attachments: m.attachments?.map((att: any) => ({
            name: att.name,
            size: att.size,
            dataUrl: att.data_url?.startsWith('/uploads/')
              ? `${API_BASE_URL.replace('/api', '')}${att.data_url}`
              : att.data_url
          }))
        }))
        
        // Prepend welcome message if not present
        if (loadedMessages.length === 0 || loadedMessages[0].role !== 'assistant') {
          setMessages([WELCOME, ...loadedMessages])
        } else {
          setMessages(loadedMessages)
        }
      }
    } catch (err) {
      console.error('Failed to load session:', err)
    } finally {
      setIsTyping(false)
    }
  }

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      const response = await fetch(`${API_BASE_URL}/session/${id}`, { method: 'DELETE' })
      if (response.ok) {
        if (sessionId === id) {
          handleNewChat()
        }
        fetchSessions()
      }
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  const handleScanForm = () => {
    setIsTyping(true)
    const chromeObj = (window as any).chrome
    if (chromeObj && chromeObj.runtime && chromeObj.runtime.sendMessage) {
      chromeObj.runtime.sendMessage({ action: 'capture_screenshot' }, async (resp: any) => {
        if (resp?.error) {
          console.error('Screenshot capture error:', resp.error)
          setIsTyping(false)
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: `Failed to capture screenshot: ${resp.error}. Make sure you are viewing an active webpage and that the extension has permission to access it.`,
              timestamp: new Date()
            }
          ])
          return
        }

        let tempMsgId = ''
        try {
          let finalDataUrl = ''
          if (resp.viewports && resp.viewports.length > 0) {
            finalDataUrl = await stitchViewports(
              resp.viewports,
              resp.scrollHeight,
              resp.clientWidth,
              resp.clientHeight,
              resp.formRect
            )
          } else if (resp.dataUrl) {
            finalDataUrl = resp.dataUrl
          }

          if (!finalDataUrl) {
            throw new Error('Screenshot data URL could not be resolved')
          }

          const userMsgId = Date.now().toString()
          const userMsg: Message = {
            id: userMsgId,
            role: 'user',
            content: 'Analyze the attached form screenshot. List all form fields and the required documents with their formats and size limits.',
            attachments: [
              {
                name: `${resp.formRect ? 'Form' : 'Full Page'} Screenshot.png`,
                dataUrl: finalDataUrl,
              }
            ],
            timestamp: new Date(),
          }

          tempMsgId = (Date.now() + 1).toString()
          const tempMsg: Message = {
            id: tempMsgId,
            role: 'assistant',
            content: '',
            timestamp: new Date()
          }

          // Replace screen with chat immediately
          setMessages([WELCOME, userMsg, tempMsg])

          const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionId,
              messages: [
                {
                  role: 'user',
                  content: userMsg.content,
                  image: finalDataUrl
                }
              ]
            }),
          })

          if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`)
          }

          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error('Failed to create stream reader')
          }

          const decoder = new TextDecoder()
          let buffer = ''
          let assistantContent = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.startsWith('data: ')) continue

              try {
                const dataStr = trimmed.slice(6)
                const data = JSON.parse(dataStr)

                if (data.type === 'session_created') {
                  setSessionId(data.session_id)
                  fetchSessions()
                } else if (data.type === 'text_delta') {
                  assistantContent += data.text
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === tempMsgId
                        ? { ...msg, content: assistantContent }
                        : msg
                    )
                  )
                } else if (data.type === 'annotation') {
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === tempMsgId
                        ? { ...msg, annotations: [...(msg.annotations || []), data.annotation] }
                        : msg
                    )
                  )
                } else if (data.type === 'error') {
                  throw new Error(data.message)
                }
              } catch (err) {
                console.error('Failed to parse SSE line:', line, err)
              }
            }
          }

          setMessages(prev =>
            prev.map(msg =>
              msg.id === tempMsgId
                ? { ...msg, content: assistantContent || null }
                : msg
            )
          )
          fetchSessions()

        } catch (err) {
          console.error('API Error:', err)
          setMessages(prev =>
            prev.map(msg =>
              msg.id === tempMsgId
                ? {
                    ...msg,
                    content: `Sorry, I encountered an error communicating with the agent: ${(err as Error).message}. Make sure the backend server is running on port 8000.`,
                  }
                : msg
            )
          )
        } finally {
          setIsTyping(false)
        }
      })
    } else {
      setIsTyping(false)
      alert("This action is only supported inside the Chrome Extension sidebar panel.")
    }
  }

  const handleUploadAttachments = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files
    if (!filesList || filesList.length === 0 || !sessionId) return

    setIsUploading(true)
    const formData = new FormData()
    for (let i = 0; i < filesList.length; i++) {
      formData.append('files', filesList[i])
    }

    const tempMsgId = Date.now().toString()
    const tempMsg: Message = {
      id: tempMsgId,
      role: 'assistant',
      content: '',
      isAgentProgress: true,
      progressEvents: [],
      timestamp: new Date()
    }

    // Instantly append progress tracker bubble to the conversation
    setMessages(prev => [...prev, tempMsg])

    try {
      const response = await fetch(`${API_BASE_URL}/upload/${sessionId}`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to create stream reader')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue

          try {
            const dataStr = trimmed.slice(6)
            const event = JSON.parse(dataStr)

            if (event.type === 'done') {
              // Store citation_map before reloading session, so we can inject it after load
              const pendingCitationMap = event.citation_map || {}
              // Reload session to pull in finalized message & attachments from backend DB
              await handleLoadSession(sessionId)
              // Patch the last assistant message with the citation map from the live event
              // (session reload won't have it until DB persistence is added)
              if (Object.keys(pendingCitationMap).length > 0) {
                setMessages(prev => {
                  const lastAssistantIdx = [...prev].reverse().findIndex(m => m.role === 'assistant' && m.content)
                  if (lastAssistantIdx === -1) return prev
                  const realIdx = prev.length - 1 - lastAssistantIdx
                  return prev.map((m, i) => i === realIdx ? { ...m, citationMap: pendingCitationMap } : m)
                })
              }
              return
            } else if (event.type === 'error') {
              throw new Error(event.message)
            } else {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === tempMsgId
                    ? { ...msg, progressEvents: [...(msg.progressEvents || []), event] }
                    : msg
                )
              )
            }
          } catch (err) {
            console.error('Failed to parse upload SSE line:', line, err)
          }
        }
      }

    } catch (err) {
      console.error('Upload error:', err)
      setMessages(prev =>
        prev.map(msg =>
          msg.id === tempMsgId
            ? {
                ...msg,
                isAgentProgress: false,
                content: `Upload failed: ${(err as Error).message}`
              }
            : msg
        )
      )
    } finally {
      setIsUploading(false)
      // reset file input
      e.target.value = ''
    }
  }

  // Check if we show the initial welcome middle CTA
  const showInitialCta = messages.filter(m => m.role === 'user').length === 0

  return (
    <div className="flex h-screen w-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans relative overflow-hidden">
      
      {/* Sidebar Drawer */}
      <div 
        className={`fixed inset-y-0 left-0 z-30 w-72 bg-white dark:bg-gray-900 border-r border-black/8 dark:border-white/10 shadow-2xl transition-transform duration-350 ease-out flex flex-col ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-black/8 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-450">
            <HiOutlineDocumentText className="w-5 h-5" />
            <span className="font-semibold text-sm tracking-tight text-gray-900 dark:text-white">Chat Histories</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 cursor-pointer"
          >
            <HiXMark className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400 dark:text-zinc-500 select-none">
              No sessions yet.
            </div>
          ) : (
            sessions.map((sess) => (
              <div
                key={sess.id}
                onClick={() => handleLoadSession(sess.id)}
                className={`flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition-all ${
                  sessionId === sess.id
                    ? 'bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-350 border border-emerald-500/20'
                    : 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-zinc-300 border border-transparent'
                }`}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="font-semibold truncate">{sess.title}</div>
                  <div className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">
                    {new Date(sess.created_at + 'Z').toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(e, sess.id)}
                  title="Delete session"
                  className="p-1 rounded text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 dark:hover:bg-rose-450/15 cursor-pointer transition-colors"
                >
                  <HiTrash className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sidebar Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-25 bg-black/30 dark:bg-black/55 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        <Header 
          onNewChat={handleNewChat} 
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
        />
        
        {showInitialCta ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 dark:bg-emerald-450/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner mb-2 animate-pulse">
              <HiCamera className="w-8 h-8" />
            </div>
            <h2 className="text-base font-bold text-gray-800 dark:text-zinc-200">Analyze Form</h2>
            <p className="text-xs text-gray-500 dark:text-zinc-400 max-w-[280px] leading-relaxed">
              Click below to capture the form on your active tab. Form Mitra will automatically analyze it and compile the required documents list.
            </p>
            <button
              onClick={handleScanForm}
              disabled={isTyping}
              className="px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-medium text-sm flex items-center gap-2 shadow-lg hover:shadow-emerald-500/25 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <HiCamera className="w-4.5 h-4.5" />
              <span>Scan & Analyze Form</span>
            </button>
          </div>
        ) : (
          <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
            {isTyping && messages[messages.length - 1].role !== 'assistant' && (
              <div className="flex gap-1 items-center h-4 mt-2 pl-12">
                {[0, 150, 300].map(delay => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 dark:bg-emerald-400/60 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            )}
            
            
            
            {!isTyping && !isUploading && messages.length > 1 && messages[messages.length - 1].role === 'assistant' && !messages.some(m => m.role === 'user' && m.content && (m.content.startsWith('Uploaded documents:') || m.content.startsWith('Uploaded attachments:'))) && (
              <div className="flex flex-col items-center justify-center p-5 border border-dashed border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-400/5 rounded-2xl space-y-2.5 animate-in fade-in duration-200">
                <p className="text-xs text-gray-600 dark:text-zinc-400 font-medium text-center max-w-[280px]">
                  Remote agent response finished. Upload the required attachments/documents to extract text:
                </p>
                <input
                  type="file"
                  multiple
                  id="doc-upload-input"
                  onChange={handleUploadAttachments}
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                />
                <label
                  htmlFor="doc-upload-input"
                  className="px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-medium text-xs flex items-center gap-2 shadow-md hover:scale-102 active:scale-98 transition-all cursor-pointer"
                >
                  <HiDocumentArrowUp className="w-4 h-4" />
                  <span>Upload Documents</span>
                </label>
              </div>
            )}
            <div ref={bottomRef} />
          </main>
        )}

        <Footer />
      </div>
    </div>
  )
}
