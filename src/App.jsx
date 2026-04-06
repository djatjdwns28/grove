import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Sidebar from './components/Sidebar'
import Terminal from './components/Terminal'
import SettingsModal from './components/SettingsModal'
import CommandPalette from './components/CommandPalette'
import StatusBar from './components/StatusBar'
import useStore from './store'
import { getUIVariables } from './themes'
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
          <div className="recent-header">Recently closed sessions</div>
          <div className="recent-empty">No closed sessions</div>
        </div>
      </div>
    )
  }

  return (
    <div className="recent-overlay" onClick={onClose}>
      <div className="recent-picker" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="recent-header">Recently closed sessions</div>
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
        <div className="recent-hint">↑↓ Navigate · Enter Restore · Esc Close</div>
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

    // Recursively get child dividers
    dividers.push(...calculateDividers(child, childBounds, [...path, i]))

    // This node's dividers (none after the last child)
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
      // Also update local sizes for correct beforeSum calculation on next mousemove
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

function SidebarResizer({ width, onResize }) {
  const handleMouseDown = (e) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e) => {
      const newWidth = Math.max(160, Math.min(500, e.clientX))
      onResize(newWidth)
    }

    const handleMouseUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return <div className="sidebar-resizer" onMouseDown={handleMouseDown} />
}

function GridDivider({ isVertical, index, sizes, gridRef, onResize }) {
  const [dragging, setDragging] = useState(false)

  // Position: account for grid padding (6px) and gap (6px)
  const n = sizes.length
  const total = sizes.reduce((a, b) => a + b, 0)
  const cumFrac = sizes.slice(0, index + 1).reduce((a, b) => a + b, 0) / total
  const padGap = 12 + (n - 1) * 6  // 2*padding + (n-1)*gap
  const offset = 9 + index * 6       // padding + index*gap + gap/2

  const handleMouseDown = (e) => {
    e.preventDefault()
    setDragging(true)
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e) => {
      if (!gridRef.current) return
      const rect = gridRef.current.getBoundingClientRect()
      const totalPx = isVertical ? rect.width : rect.height
      const contentArea = totalPx - 12 - (n - 1) * 6
      if (contentArea <= 0) return

      const mouseOffset = isVertical ? e.clientX - rect.left : e.clientY - rect.top
      const sum = sizes.reduce((a, b) => a + b, 0)
      const beforeFrac = sizes.slice(0, index).reduce((a, b) => a + b, 0) / sum
      const combinedFrac = (sizes[index] + sizes[index + 1]) / sum

      // Pixel start of the combined zone (content of col[index] + gap + content of col[index+1])
      const startPx = 6 + beforeFrac * contentArea + index * 6
      const combinedTotal = combinedFrac * contentArea + 6
      let frac = (mouseOffset - startPx) / combinedTotal

      const min = 0.1
      frac = Math.max(min, Math.min(1 - min, frac))

      const combined = sizes[index] + sizes[index + 1]
      const newSizes = [...sizes]
      newSizes[index] = frac * combined
      newSizes[index + 1] = (1 - frac) * combined
      onResize(newSizes)
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
    ? { left: `calc(${cumFrac} * (100% - ${padGap}px) + ${offset}px)`, top: 0, bottom: 0 }
    : { top: `calc(${cumFrac} * (100% - ${padGap}px) + ${offset}px)`, left: 0, right: 0 }

  return (
    <div
      className={`grid-divider ${isVertical ? 'grid-col-divider' : 'grid-row-divider'} ${dragging ? 'grid-divider-active' : ''}`}
      style={style}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => onResize(null)}
    />
  )
}

function App() {
  const settings = useStore((s) => s.settings)

  // Inject CSS variables from active theme
  useEffect(() => {
    const vars = getUIVariables(settings.themeName, settings.customColors)
    const root = document.documentElement
    Object.entries(vars).forEach(([key, val]) => root.style.setProperty(key, val))
  }, [settings.themeName, settings.customColors])

  const activeSessionId = useStore((s) => s.activeSessionId)
  const directories = useStore((s) => s.directories)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const removeSession = useStore((s) => s.removeSession)
  const workspaceLayout = useStore((s) => s.workspaceLayout)
  const draggingSessionId = useStore((s) => s.draggingSessionId)
  const draggingFromWorkspace = useStore((s) => s.draggingFromWorkspace)
  const setDraggingSessionId = useStore((s) => s.setDraggingSessionId)
  const addSessionToWorkspaceRoot = useStore((s) => s.addSessionToWorkspaceRoot)
  const splitPane = useStore((s) => s.splitPane)
  const cloneSession = useStore((s) => s.cloneSession)
  const toggleBroadcast = useStore((s) => s.toggleBroadcast)
  const gridColSizes = useStore((s) => s.gridColSizes)
  const gridRowSizes = useStore((s) => s.gridRowSizes)
  const updateGridColSizes = useStore((s) => s.updateGridColSizes)
  const updateGridRowSizes = useStore((s) => s.updateGridRowSizes)
  const [showSettings, setShowSettings] = useState(false)
  const [showRecent, setShowRecent] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [mainDropZone, setMainDropZone] = useState(null)
  const [gridDragIdx, setGridDragIdx] = useState(null)
  const [gridDropIdx, setGridDropIdx] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('grove-sidebar-width')
    return saved ? parseInt(saved, 10) : 230
  })
  const mainRef = useRef(null)
  const gridRef = useRef(null)

  // Scrollback save on quit
  useEffect(() => {
    const cleanup = window.electronAPI.onBeforeQuit(() => {
      window.dispatchEvent(new Event('grove:save-scrollback'))
      setTimeout(() => window.electronAPI.signalQuitReady(), 2000)
    })
    return cleanup
  }, [])

  // Reset drop zone when drag ends
  useEffect(() => {
    if (!draggingSessionId) setMainDropZone(null)
  }, [draggingSessionId])

  // Centralized git status polling — active cwd every 10s, inactive every 60s, skip when unfocused
  useEffect(() => {
    const cwdToSessionIds = new Map()
    directories.forEach((dir) => {
      dir.sessions.forEach((s) => {
        const existing = cwdToSessionIds.get(s.cwd) || []
        existing.push(s.id)
        cwdToSessionIds.set(s.cwd, existing)
      })
    })

    if (cwdToSessionIds.size === 0) return

    const activeSession = directories.flatMap(d => d.sessions).find(s => s.id === activeSessionId)
    const activeCwd = activeSession?.cwd
    let tickCount = 0

    const poll = async () => {
      if (!document.hasFocus()) return
      tickCount++
      for (const [cwd, sessionIds] of cwdToSessionIds) {
        // Active cwd: every tick (10s). Inactive: every 6th tick (60s)
        if (cwd !== activeCwd && tickCount % 6 !== 0) continue
        try {
          const status = await window.electronAPI.getGitStatus(cwd)
          if (status) {
            sessionIds.forEach((id) =>
              useStore.getState().updateSessionGitStatus(id, status)
            )
          }
        } catch {}
      }
    }

    poll()
    const interval = setInterval(poll, 10000)
    return () => clearInterval(interval)
  }, [directories, activeSessionId])

  const gridOrder = useStore((s) => s.gridOrder)
  const reorderGrid = useStore((s) => s.reorderGrid)
  const getGridOrderedSessions = useStore((s) => s.getGridOrderedSessions)

  const allSessions = useMemo(
    () => getGridOrderedSessions(),
    [directories, gridOrder]
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
        // Cmd+F is handled directly by TerminalPane
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

    // Cmd+Shift+[ / ] — cycle sessions
    if (e.shiftKey && (e.key === '[' || e.key === ']') && allSessions.length > 0) {
      e.preventDefault()
      const idx = allSessions.findIndex((s) => s.id === activeSessionId)
      const next = e.key === ']'
        ? allSessions[(idx + 1) % allSessions.length]
        : allSessions[(idx - 1 + allSessions.length) % allSessions.length]
      if (next) setActiveSession(next.id)
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
      <Sidebar onOpenSettings={() => setShowSettings(true)} style={{ width: sidebarWidth }} />
      <SidebarResizer width={sidebarWidth} onResize={(w) => { setSidebarWidth(w); localStorage.setItem('grove-sidebar-width', w) }} />
      <div className="main" ref={mainRef}>
        {allSessions.length === 0 && (
          <div className="empty-state">
            <div className="empty-hint">
              <span className="empty-arrow">←</span>
              <span>Add a directory and start a session</span>
            </div>
          </div>
        )}
        {/* Grid mode: flat grid of all sessions */}
        {!workspaceLayout && allSessions.length > 0 && (() => {
          const cols = Math.ceil(Math.sqrt(allSessions.length))
          const rows = Math.ceil(allSessions.length / cols)
          const colSizes = gridColSizes && gridColSizes.length === cols
            ? gridColSizes : Array(cols).fill(1)
          const rowSizes = gridRowSizes && gridRowSizes.length === rows
            ? gridRowSizes : Array(rows).fill(1)
          return (
            <div className="flat-grid-wrapper">
              <div
                ref={gridRef}
                className="flat-grid"
                style={{
                  gridTemplateColumns: colSizes.map((s) => `${s}fr`).join(' '),
                  gridTemplateRows: rowSizes.map((s) => `${s}fr`).join(' '),
                }}
              >
                {allSessions.map((s, idx) => {
                  const isLastItem = idx === allSessions.length - 1
                  const lastRowItems = allSessions.length % cols
                  const colSpan = isLastItem && lastRowItems !== 0 ? cols - lastRowItems + 1 : 1
                  return (
                  <div
                    key={s.id}
                    className={`grid-cell${gridDragIdx === idx ? ' grid-dragging' : ''}${gridDropIdx === idx ? ' grid-drop-target' : ''}`}
                    style={colSpan > 1 ? { gridColumn: `span ${colSpan}` } : undefined}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/grid-idx', String(idx))
                      setGridDragIdx(idx)
                    }}
                    onDragEnd={() => { setGridDragIdx(null); setGridDropIdx(null) }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (gridDragIdx !== null && gridDragIdx !== idx) setGridDropIdx(idx)
                    }}
                    onDragLeave={() => setGridDropIdx((cur) => cur === idx ? null : cur)}
                    onDrop={(e) => {
                      e.preventDefault()
                      const from = parseInt(e.dataTransfer.getData('text/grid-idx'), 10)
                      if (!isNaN(from) && from !== idx) {
                        reorderGrid(from, idx)
                        setGridDragIdx(null)
                        setGridDropIdx(null)
                      }
                    }}
                  >
                    <Terminal
                      session={s}
                      isActive={s.id === activeSessionId}
                      isVisible={true}
                      bounds={null}
                    />
                  </div>
                  )
                })}
              </div>
              {cols > 1 && colSizes.slice(0, -1).map((_, i) => (
                <GridDivider
                  key={`col-${i}`}
                  isVertical={true}
                  index={i}
                  sizes={colSizes}
                  gridRef={gridRef}
                  onResize={updateGridColSizes}
                />
              ))}
              {rows > 1 && rowSizes.slice(0, -1).map((_, i) => (
                <GridDivider
                  key={`row-${i}`}
                  isVertical={false}
                  index={i}
                  sizes={rowSizes}
                  gridRef={gridRef}
                  onResize={updateGridRowSizes}
                />
              ))}
            </div>
          )
        })()}

        {/* Workspace mode: absolute positioned sessions */}
        {workspaceLayout && allSessions.map((session) => (
          <Terminal
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            isVisible={!!sessionBounds[session.id]}
            bounds={sessionBounds[session.id] || null}
          />
        ))}
        {workspaceLayout && workspaceDividers.map((div, i) => (
          <WorkspaceDivider key={i} divider={div} mainRef={mainRef} />
        ))}

        {/* Main area edge drop zones (root level split) */}
        {workspaceLayout && draggingSessionId && !draggingFromWorkspace && (
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
                <div className="drop-overlay-label">Full split</div>
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
