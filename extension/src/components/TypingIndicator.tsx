import { RiRobot2Line } from 'react-icons/ri'

export default function TypingIndicator() {
  return (
    <div className="flex gap-2.5 items-end">
      <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 dark:bg-emerald-400/20 border border-emerald-300/40 dark:border-emerald-500/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
        <RiRobot2Line className="w-4 h-4" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white dark:bg-white/10 border border-black/8 dark:border-white/12">
        <div className="flex gap-1 items-center h-4">
          {[0, 150, 300].map(delay => (
            <span key={delay} className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}
