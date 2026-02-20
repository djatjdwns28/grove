import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'

const commands = [
  { id: 'new-session', label: 'New Session', desc: 'Add new session to current directory', icon: '+' },
  { id: 'close-session', label: 'Close Session', desc: 'Close current active session', icon: '×' },
  { id: 'clone-session', label: 'Clone Session', desc: 'Clone current session to the same path', icon: '⧉' },
  { id: 'vsplit', label: 'Vertical Split', desc: 'Split terminal vertically (Cmd+D)', icon: '▏' },
  { id: 'hsplit', label: 'Horizontal Split', desc: 'Split terminal horizontally (Cmd+Shift+D)', icon: '―' },
  { id: 'broadcast', label: 'Toggle Broadcast', desc: 'Simultaneous input to all terminals', icon: '📡' },
  { id: 'settings', label: 'Open Settings', desc: 'Change terminal settings', icon: '⚙' },
  { id: 'search', label: 'Search', desc: 'Search text in terminal (Cmd+F)', icon: '🔍' },
]

function CommandPalette({ onClose, onAction }) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [branchStatus, setBranchStatus] = useState(null) // null | 'checking' | 'creating' | { error: string }
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const overlayRef = useRef(null)

  const directories = useStore((s) => s.directories)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const addSession = useStore((s) => s.addSession)

  const activeDir = directories.find((d) =>
    d.sessions.some((s) => s.id === activeSessionId)
  )

  const allSessions = directories.flatMap((dir) =>
    dir.sessions.map((s) => ({
      id: `session:${s.id}`,
      label: s.name,
      desc: dir.name,
      icon: '●',
      sessionId: s.id,
    }))
  )

  const allItems = [...commands, ...allSessions]

  const filtered = query
    ? allItems.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.desc.toLowerCase().includes(query.toLowerCase())
      )
    : allItems

  const showBranchOption = query.trim() && filtered.length === 0 && activeDir

  // Total selectable items count
  const totalItems = filtered.length + (showBranchOption ? 1 : 0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIdx(0)
    setBranchStatus(null)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const handleSelect = (item) => {
    onClose()
    if (item.sessionId) {
      useStore.getState().setActiveSession(item.sessionId)
    } else {
      onAction(item.id)
    }
  }

  const handleBranchCheckout = async () => {
    if (!activeDir || !query.trim()) return
    const branchName = query.trim()

    setBranchStatus('checking')

    try {
      const { branches, isGit } = await window.electronAPI.getAllBranches(activeDir.path)
      if (!isGit) {
        setBranchStatus({ error: 'Not a git repository' })
        return
      }

      const match = branches.find((b) => b.name === branchName)
      if (!match) {
        setBranchStatus({ error: `Branch "${branchName}" not found (local & remote)` })
        return
      }

      setBranchStatus(match.remote ? 'creating-remote' : 'creating')
      const result = await window.electronAPI.addGitWorktree({
        repoPath: activeDir.path,
        branch: branchName,
      })

      if (result.success) {
        addSession(activeDir.id, branchName, result.path)
        onClose()
      } else {
        setBranchStatus({ error: result.error || 'Failed to create worktree' })
      }
    } catch (e) {
      setBranchStatus({ error: e.message || 'Unknown error' })
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, totalItems - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length > 0 && selectedIdx < filtered.length) {
        handleSelect(filtered[selectedIdx])
      } else if (showBranchOption && selectedIdx === filtered.length) {
        handleBranchCheckout()
      }
    }
    if (e.key === 'Escape') onClose()
  }

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div className="palette-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="palette">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search commands, sessions, or branch name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="palette-list" ref={listRef}>
          {filtered.map((item, idx) => (
            <div
              key={item.id}
              className={`palette-item ${idx === selectedIdx ? 'selected' : ''}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span className="palette-icon">{item.icon}</span>
              <span className="palette-label">{item.label}</span>
              <span className="palette-desc">{item.desc}</span>
            </div>
          ))}

          {showBranchOption && (
            <div
              className={`palette-item palette-branch-item ${selectedIdx === filtered.length ? 'selected' : ''}`}
              onClick={handleBranchCheckout}
              onMouseEnter={() => setSelectedIdx(filtered.length)}
            >
              <span className="palette-icon">🌿</span>
              <span className="palette-label">
                Checkout: <strong>{query.trim()}</strong>
              </span>
              <span className="palette-desc">
                {branchStatus === 'checking' && 'Checking branch...'}
                {branchStatus === 'creating' && 'Creating worktree...'}
                {branchStatus === 'creating-remote' && 'Creating worktree from remote...'}
                {branchStatus?.error && <span className="palette-error">{branchStatus.error}</span>}
                {!branchStatus && `Create worktree in ${activeDir.name}`}
              </span>
            </div>
          )}

          {!showBranchOption && filtered.length === 0 && (
            <div className="palette-empty">No results</div>
          )}
        </div>
        <div className="palette-hint">↑↓ Navigate · Enter Execute · Esc Close</div>
      </div>
    </div>
  )
}

export default CommandPalette
