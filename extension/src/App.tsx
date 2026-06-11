import { useState, useRef, useEffect, useCallback } from 'react'
import Header from './components/Header'
import MessageBubble from './components/MessageBubble'
import Footer from './components/Footer'
import type { Message, Attachment } from './components/MessageBubble'
import { stitchViewports } from './utils/screenshot'

const WELCOME: Message = {
  id: '1',
  role: 'assistant',
  content: "Hello! I'm Form Mitra, your AI form-filling assistant. Upload a document or ask me anything about your forms.",
  timestamp: new Date(),
}

const API_BASE_URL = 'http://localhost:8000/api'

export default function App() {
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [inputText, setInputText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const captureFormScreenshot = useCallback(() => {
    const chromeObj = (window as any).chrome
    if (chromeObj && chromeObj.runtime && chromeObj.runtime.sendMessage) {
      chromeObj.runtime.sendMessage({ action: 'capture_screenshot' }, async (resp: any) => {
        if (resp?.error) {
          console.error('Screenshot capture error:', resp.error)
          return
        }

        try {
          let finalDataUrl = ''
          if (resp.viewports && resp.viewports.length > 0) {
            finalDataUrl = await stitchViewports(
              resp.viewports,
              resp.scrollHeight,
              resp.clientWidth,
              resp.clientHeight
            )
          } else if (resp.dataUrl) {
            finalDataUrl = resp.dataUrl
          }

          if (finalDataUrl) {
            const title = resp.title || 'Active Tab'
            const fileName = `${title}.png`
            setFiles(prev => {
              // Avoid duplicates by filename
              if (prev.some(f => f.name === fileName)) return prev
              return [
                ...prev,
                {
                  name: fileName,
                  dataUrl: finalDataUrl,
                },
              ]
            })
          }
        } catch (stitchErr) {
          console.error('Stitching viewports failed:', stitchErr)
        }
      })
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    // Capture screenshot of the form immediately on extension open
    captureFormScreenshot()
  }, [captureFormScreenshot])

  const handleNewChat = async () => {
    if (sessionId) {
      try {
        await fetch(`${API_BASE_URL}/session/${sessionId}`, { method: 'DELETE' })
      } catch (err) {
        console.error('Failed to delete session on new chat:', err)
      }
    }
    setSessionId(null)
    setMessages([{ ...WELCOME, id: Date.now().toString(), timestamp: new Date() }])
    setInputText('')
    setFiles([])
    // Re-capture form screenshot on chat reset
    setTimeout(() => {
      captureFormScreenshot()
    }, 100)
  }

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    const currentFiles = [...files]
    if (!text && currentFiles.length === 0) return

    // Add user message to UI immediately
    const userMsgId = Date.now().toString()
    const userMsg: Message = {
      id: userMsgId,
      role: 'user',
      content: text,
      attachments: currentFiles.length > 0 ? currentFiles : undefined,
      timestamp: new Date(),
    }
    
    // Add placeholder assistant message immediately to render thinking dots inline
    const tempMsgId = (Date.now() + 1).toString()
    const tempMsg: Message = {
      id: tempMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    }
    
    let currentHistory = [...messages, userMsg, tempMsg]
    setMessages(currentHistory)
    setInputText('')
    setFiles([])
    setIsTyping(true)

    try {
      // Map messages to payload format, excluding the placeholder message
      const payloadMessages = currentHistory
        .filter(m => m.id !== tempMsgId)
        .map(m => ({
          role: m.role,
          content: m.content || null,
          image: m.attachments?.find(f => f.dataUrl)?.dataUrl || undefined
        }))

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payloadMessages }),
      })

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to open stream reader.')
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

            if (data.type === 'text_delta') {
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

      // Finalize the history state post-stream
      setMessages(prev =>
        prev.map(msg =>
          msg.id === tempMsgId
            ? { ...msg, content: assistantContent || null }
            : msg
        )
      )

    } catch (err) {
      console.error('API Error:', err)
      // Overwrite the placeholder with the error message
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
  }, [inputText, files, messages])

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans">
      <Header onNewChat={handleNewChat} />
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
        <div ref={bottomRef} />
      </main>
      <Footer
        inputText={inputText}
        attachedFiles={files}
        onInputChange={setInputText}
        onFilesChange={setFiles}
        onSend={handleSend}
      />
    </div>
  )
}
