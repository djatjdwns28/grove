import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'

const commands = [
  { id: 'new-session', label: '새 세션', desc: '현재 디렉토리에 새 세션 추가', icon: '+' },
  { id: 'close-session', label: '세션 닫기', desc: '현재 활성 세션 닫기', icon: '×' },
  { id: 'clone-session', label: '세션 복제', desc: '현재 세션을 같은 경로로 복제', icon: '⧉' },
  { id: 'vsplit', label: '세로 분할', desc: '터미널을 세로로 분할 (Cmd+D)', icon: '▏' },
  { id: 'hsplit', label: '가로 분할', desc: '터미널을 가로로 분할 (Cmd+Shift+D)', icon: '―' },
  { id: 'broadcast', label: '브로드캐스트 토글', desc: '모든 터미널에 동시 입력', icon: '📡' },
  { id: 'settings', label: '설정 열기', desc: '터미널 설정 변경', icon: '⚙' },
  { id: 'search', label: '검색', desc: '터미널 내 텍스트 검색 (Cmd+F)', icon: '🔍' },
]

function CommandPalette({ onClose, onAction }) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const overlayRef = useRef(null)

  const directories = useStore((s) => s.directories)
  const activeSessionId = useStore((s) => s.activeSessionId)

  // 세션 목록도 검색 가능
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

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIdx(0)
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

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault()
      handleSelect(filtered[selectedIdx])
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
          placeholder="명령어 또는 세션 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="palette-empty">결과 없음</div>
          )}
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
        </div>
        <div className="palette-hint">↑↓ 이동 · Enter 실행 · Esc 닫기</div>
      </div>
    </div>
  )
}

export default CommandPalette
