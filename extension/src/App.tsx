import { useState, useRef, useEffect, useCallback } from 'react'
import Header from './components/Header'
import MessageBubble from './components/MessageBubble'
import TypingIndicator from './components/TypingIndicator'
import Footer from './components/Footer'
import type { Message, Attachment } from './components/MessageBubble'

const WELCOME: Message = {
  id: '1',
  role: 'assistant',
  content: "Hello! I'm Form Mitra, your AI form-filling assistant. Upload a document or ask me anything about your forms.",
  timestamp: new Date(),
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [inputText, setInputText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleNewChat = () => {
    setMessages([{ ...WELCOME, id: Date.now().toString(), timestamp: new Date() }])
    setInputText('')
    setFiles([])
  }

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text && files.length === 0) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      attachments: files.length > 0 ? [...files] : undefined,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInputText('')
    setFiles([])

    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I've received your message. I'll help you with your form-related queries.",
        timestamp: new Date(),
      }])
    }, 1500)
  }, [inputText, files])

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans">
      <Header onNewChat={handleNewChat} />
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
        {isTyping && <TypingIndicator />}
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
