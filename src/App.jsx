import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Sidebar from './components/Sidebar'
import Terminal from './components/Terminal'
import SettingsModal from './components/SettingsModal'
import CommandPalette from './components/CommandPalette'
import StatusBar from './components/StatusBar'
import useStore from './store'
import './App.css'

function RecentSessionsPicker({ onClose }) {
  const recentlyClosed = useStore((s) => s.recentlyClosed)
  const restoreSession = useStore((s) => s.restoreSession)
  const directories = useStore((s) => s.directories)
  const ref = useRef(null)
  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, recentlyClosed.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
      }
      if (e.key === 'Enter' && recentlyClosed.length > 0) {
        e.preventDefault()
        restoreSession(selectedIdx)
        onClose()
      }
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [recentlyClosed, selectedIdx, restoreSession, onClose])

  const getDirName = (dirId) => directories.find((d) => d.id === dirId)?.name || ''

  if (recentlyClosed.length === 0) {
    return (
      <div className="recent-overlay" onClick={onClose}>
        <div className="recent-picker" ref={ref}>
          <div className="recent-header">최근 닫힌 세션</div>
          <div className="recent-empty">닫힌 세션이 없습니다</div>
        </div>
      </div>
    )
  }

  return (
    <div className="recent-overlay" onClick={onClose}>
      <div className="recent-picker" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="recent-header">최근 닫힌 세션</div>
        <div className="recent-list">
          {recentlyClosed.map((item, idx) => (
            <div
              key={idx}
              className={`recent-item ${idx === selectedIdx ? 'selected' : ''}`}
              onClick={() => { restoreSession(idx); onClose() }}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span className="recent-name">{item.name}</span>
              <span className="recent-dir">{getDirName(item.dirId)}</span>
            </div>
          ))}
        </div>
        <div className="recent-hint">↑↓ 이동 · Enter 복원 · Esc 닫기</div>
      </div>
    </div>
  )
}

function calculateBounds(node, bounds = { x: 0, y: 0, w: 1, h: 1 }) {
  if (node.type === 'session') {
    return [{ sessionId: node.sessionId, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }]
  }
  const results = []
  const isVertical = node.type === 'vsplit'
  const sizes = node.sizes || node.children.map(() => 1 / node.children.length)
  let offset = 0
  node.children.forEach((child, i) => {
    const size = sizes[i]
    const childBounds = isVertical
      ? { x: bounds.x + bounds.w * offset, y: bounds.y, w: bounds.w * size, h: bounds.h }
      : { x: bounds.x, y: bounds.y + bounds.h * offset, w: bounds.w, h: bounds.h * size }
    results.push(...calculateBounds(child, childBounds))
    offset += size
  })
  return results
}

function calculateDividers(node, bounds = { x: 0, y: 0, w: 1, h: 1 }, path = []) {
  if (node.type === 'session') return []
  const isVertical = node.type === 'vsplit'
  const sizes = node.sizes || node.children.map(() => 1 / node.children.length)
  const dividers = []
  let offset = 0

  node.children.forEach((child, i) => {
    const size = sizes[i]
    const childBounds = isVertical
      ? { x: bounds.x + bounds.w * offset, y: bounds.y, w: bounds.w * size, h: bounds.h }
      : { x: bounds.x, y: bounds.y + bounds.h * offset, w: bounds.w, h: bounds.h * size }

    // 자식 내부 디바이더 재귀
    dividers.push(...calculateDividers(child, childBounds, [...path, i]))

    // 이 노드의 디바이더 (마지막 자식 뒤에는 없음)
    if (i < node.children.length - 1) {
      const divPos = offset + size
      dividers.push({
        isVertical,
        pos: isVertical
          ? { left: bounds.x + bounds.w * divPos, top: bounds.y, height: bounds.h }
          : { top: bounds.y + bounds.h * divPos, left: bounds.x, width: bounds.w },
        parentBounds: bounds,
        path,
        index: i,
        sizes: [...sizes],
      })
    }
    offset += size
  })
  return dividers
}

function WorkspaceDivider({ divider, mainRef }) {
  const updateWorkspaceSizes = useStore((s) => s.updateWorkspaceSizes)
  const [dragging, setDragging] = useState(false)
  const { isVertical, pos, parentBounds, path, index, sizes } = divider

  const handleMouseDown = (e) => {
    e.preventDefault()
    setDragging(true)
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e) => {
      if (!mainRef.current) return
      const rect = mainRef.current.getBoundingClientRect()
      const mouseFrac = isVertical
        ? (e.clientX - rect.left) / rect.width
        : (e.clientY - rect.top) / rect.height

      const parentStart = isVertical ? parentBounds.x : parentBounds.y
      const parentSize = isVertical ? parentBounds.w : parentBounds.h
      const relativePos = (mouseFrac - parentStart) / parentSize
      const clamped = Math.max(0, Math.min(1, relativePos))

      const beforeSum = sizes.slice(0, index).reduce((a, b) => a + b, 0)
      const combined = sizes[index] + sizes[index + 1]
      const min = 0.1

      let s1 = clamped - beforeSum
      let s2 = combined - s1
      if (s1 < min) { s1 = min; s2 = combined - min }
      if (s2 < min) { s2 = min; s1 = combined - min }

      const newSizes = [...sizes]
      newSizes[index] = s1
      newSizes[index + 1] = s2
      // 로컬 sizes도 업데이트해서 다음 mousemove에서 올바른 beforeSum 계산
      sizes[index] = s1
      sizes[index + 1] = s2
      updateWorkspaceSizes(path, newSizes)
    }

    const handleMouseUp = () => {
      setDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const style = isVertical
    ? {
        position: 'absolute',
        left: `${pos.left * 100}%`,
        top: `${pos.top * 100}%`,
        height: `${pos.height * 100}%`,
        width: '6px',
        transform: 'translateX(-3px)',
        cursor: 'col-resize',
        zIndex: 20,
      }
    : {
        position: 'absolute',
        top: `${pos.top * 100}%`,
        left: `${pos.left * 100}%`,
        width: `${pos.width * 100}%`,
        height: '6px',
        transform: 'translateY(-3px)',
        cursor: 'row-resize',
        zIndex: 20,
      }

  return (
    <div
      className={`ws-divider ${dragging ? 'ws-divider-active' : ''}`}
      style={style}
      onMouseDown={handleMouseDown}
    />
  )
}

function App() {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const directories = useStore((s) => s.directories)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const removeSession = useStore((s) => s.removeSession)
  const workspaceLayout = useStore((s) => s.workspaceLayout)
  const draggingSessionId = useStore((s) => s.draggingSessionId)
  const setDraggingSessionId = useStore((s) => s.setDraggingSessionId)
  const addSessionToWorkspaceRoot = useStore((s) => s.addSessionToWorkspaceRoot)
  const splitPane = useStore((s) => s.splitPane)
  const cloneSession = useStore((s) => s.cloneSession)
  const toggleBroadcast = useStore((s) => s.toggleBroadcast)
  const [showSettings, setShowSettings] = useState(false)
  const [showRecent, setShowRecent] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [mainDropZone, setMainDropZone] = useState(null)
  const mainRef = useRef(null)

  // 드래그 끝나면 드롭존 초기화
  useEffect(() => {
    if (!draggingSessionId) setMainDropZone(null)
  }, [draggingSessionId])

  const allSessions = directories.flatMap((dir) =>
    dir.sessions.map((s) => ({ ...s, dirId: dir.id }))
  )

  const sessionBounds = useMemo(() => {
    if (!workspaceLayout) return {}
    const bounds = calculateBounds(workspaceLayout)
    return Object.fromEntries(bounds.map(b => [b.sessionId, { x: b.x, y: b.y, w: b.w, h: b.h }]))
  }, [workspaceLayout])

  const workspaceDividers = useMemo(() => {
    if (!workspaceLayout) return []
    return calculateDividers(workspaceLayout)
  }, [workspaceLayout])

  const handlePaletteAction = useCallback((actionId) => {
    const state = useStore.getState()
    const session = state.directories
      .flatMap((d) => d.sessions.map((s) => ({ ...s, dirId: d.id })))
      .find((s) => s.id === state.activeSessionId)

    switch (actionId) {
      case 'new-session':
        if (session) {
          const dir = state.directories.find((d) => d.id === session.dirId)
          if (dir) useStore.getState().addSession(dir.id, 'session', dir.path)
        }
        break
      case 'close-session':
        if (session) removeSession(session.dirId, session.id)
        break
      case 'clone-session':
        if (session) cloneSession(session.dirId, session.id)
        break
      case 'vsplit':
        if (session) splitPane(session.id, session.activePaneId || session.id, 'vsplit')
        break
      case 'hsplit':
        if (session) splitPane(session.id, session.activePaneId || session.id, 'hsplit')
        break
      case 'broadcast':
        toggleBroadcast()
        break
      case 'settings':
        setShowSettings(true)
        break
      case 'search':
        // Cmd+F는 TerminalPane에서 직접 처리
        break
    }
  }, [removeSession, cloneSession, splitPane, toggleBroadcast])

  const handleKeyDown = useCallback((e) => {
    if (!e.metaKey) return

    if (e.key === 'p') {
      e.preventDefault()
      setShowPalette((prev) => !prev)
      return
    }

    if (e.key === 't') {
      e.preventDefault()
      setShowRecent((prev) => !prev)
      return
    }

    const num = parseInt(e.key, 10)
    if (num >= 1 && num <= 9) {
      e.preventDefault()
      const session = allSessions[num - 1]
      if (session) setActiveSession(session.id)
      return
    }

    if (e.key === 'w' && !e.shiftKey) {
      e.preventDefault()
      if (activeSessionId) {
        const current = allSessions.find((s) => s.id === activeSessionId)
        if (current) removeSession(current.dirId, current.id)
      }
      return
    }
  }, [allSessions, activeSessionId, setActiveSession, removeSession])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="app">
      <div className="app-body">
      <Sidebar onOpenSettings={() => setShowSettings(true)} />
      <div className="main" ref={mainRef}>
        {allSessions.length === 0 && (
          <div className="empty-state">
            <div className="empty-hint">
              <span className="empty-arrow">←</span>
              <span>디렉토리를 추가하고 세션을 시작하세요</span>
            </div>
          </div>
        )}
        {allSessions.map((session) => (
          <Terminal
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            isVisible={workspaceLayout ? !!sessionBounds[session.id] : session.id === activeSessionId}
            bounds={sessionBounds[session.id] || null}
          />
        ))}
        {workspaceDividers.map((div, i) => (
          <WorkspaceDivider key={i} divider={div} mainRef={mainRef} />
        ))}

        {/* 메인 영역 가장자리 드롭 존 (루트 레벨 분할) */}
        {draggingSessionId && (
          <>
            {['left', 'right', 'top', 'bottom'].map((zone) => (
              <div
                key={zone}
                className={`main-edge main-edge-${zone}`}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setMainDropZone(zone) }}
                onDragLeave={(e) => {
                  if (e.currentTarget && !e.currentTarget.contains(e.relatedTarget)) setMainDropZone(null)
                }}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation()
                  if (draggingSessionId) {
                    addSessionToWorkspaceRoot(draggingSessionId, mainDropZone || zone)
                    setActiveSession(draggingSessionId)
                    setDraggingSessionId(null)
                  }
                  setMainDropZone(null)
                }}
              />
            ))}
            {mainDropZone && (
              <div className={`main-drop-indicator main-drop-${mainDropZone}`}>
                <div className="drop-overlay-label">전체 분할</div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
      <StatusBar />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showRecent && <RecentSessionsPicker onClose={() => setShowRecent(false)} />}
      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          onAction={handlePaletteAction}
        />
      )}
    </div>
  )
}

export default App
