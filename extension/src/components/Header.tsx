import { HiOutlineDocumentText, HiPlus, HiBars3 } from 'react-icons/hi2'

export default function Header({
  onNewChat,
  onToggleSidebar,
}: {
  onNewChat: () => void
  onToggleSidebar: () => void
}) {
  return (
    <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-black/8 dark:border-white/10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <button
          id="toggle-sidebar-btn"
          onClick={onToggleSidebar}
          title="Toggle history"
          className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
        >
          <HiBars3 className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white shadow-sm">
            <HiOutlineDocumentText className="w-4.5 h-4.5" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight">Form Mitra</h1>
        </div>
      </div>
      <button
        id="new-chat-btn"
        onClick={onNewChat}
        title="New chat"
        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
      >
        <HiPlus className="w-4 h-4" />
      </button>
    </header>
  )
}
