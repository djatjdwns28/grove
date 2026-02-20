import React, { useEffect, useCallback, useState, useRef } from 'react'
import TerminalPane from './TerminalPane'
import useStore from '../store'

function SplitDivider({ isVertical, containerRef, index, sizes, onResize }) {
  const [dragging, setDragging] = useState(false)

  const handleMouseDown = (e) => {
    e.preventDefault()
    setDragging(true)
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const total = isVertical ? rect.width : rect.height
      const pos = (isVertical ? e.clientX - rect.left : e.clientY - rect.top) / total

      const beforeSum = sizes.slice(0, index).reduce((a, b) => a + b, 0)
      const combined = sizes[index] + sizes[index + 1]
      const min = 0.1

      let s1 = pos - beforeSum
      let s2 = combined - s1
      if (s1 < min) { s1 = min; s2 = combined - min }
      if (s2 < min) { s2 = min; s1 = combined - min }

      const newSizes = [...sizes]
      newSizes[index] = s1
      newSizes[index + 1] = s2
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

  return (
    <div
      className={`split-divider ${dragging ? 'split-divider-active' : ''}`}
      onMouseDown={handleMouseDown}
    />
  )
}

function SplitView({ node, sessionId, isVisible, isFocused, path = [] }) {
  const containerRef = useRef(null)
  const activePaneId = useStore((s) => {
    for (const d of s.directories) {
      const ss = d.sessions.find((ss) => ss.id === sessionId)
      if (ss) return ss.activePaneId
    }
    return null
  })
  const setActivePaneId = useStore((s) => s.setActivePaneId)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const updateLayoutSizes = useStore((s) => s.updateLayoutSizes)
  const focused = isFocused !== undefined ? isFocused : isVisible

  if (node.type === 'pane') {
    return (
      <TerminalPane
        paneId={node.id}
        cwd={node.cwd}
        isVisible={isVisible}
        isFocused={focused && activePaneId === node.id}
        sessionId={sessionId}
        onFocus={() => {
          setActivePaneId(sessionId, node.id)
          setActiveSession(sessionId)
        }}
      />
    )
  }

  const isVertical = node.type === 'vsplit'
  const sizes = node.sizes || node.children.map(() => 1 / node.children.length)

  return (
    <div ref={containerRef} className={`split-container ${isVertical ? 'split-vertical' : 'split-horizontal'}`}>
      {node.children.map((child, i) => (
        <React.Fragment key={child.type === 'pane' ? child.id : i}>
          {i > 0 && (
            <SplitDivider
              isVertical={isVertical}
              containerRef={containerRef}
              index={i - 1}
              sizes={sizes}
              onResize={(newSizes) => updateLayoutSizes(sessionId, path, newSizes)}
            />
          )}
          <div className="split-child" style={{ flex: `${sizes[i]} 0 0` }}>
            <SplitView node={child} sessionId={sessionId} isVisible={isVisible} isFocused={focused} path={[...path, i]} />
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

function Terminal({ session, isActive, isVisible, bounds }) {
  const settings = useStore((s) => s.settings)
  const splitPane = useStore((s) => s.splitPane)
  const closePane = useStore((s) => s.closePane)
  const updateSessionGitStatus = useStore((s) => s.updateSessionGitStatus)
  const addSessionToWorkspace = useStore((s) => s.addSessionToWorkspace)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const draggingSessionId = useStore((s) => s.draggingSessionId)
  const setDraggingSessionId = useStore((s) => s.setDraggingSessionId)
  const broadcastMode = useStore((s) => s.broadcastMode)
  const toggleBroadcast = useStore((s) => s.toggleBroadcast)

  const [dropZone, setDropZone] = useState(null)
  const wrapperRef = useRef(null)

  const vis = isVisible !== undefined ? isVisible : isActive
  const layout = session.layout || { type: 'pane', id: session.id, cwd: session.cwd }
  const activePaneId = session.activePaneId || session.id

  const showDragCapture = vis && draggingSessionId && draggingSessionId !== session.id

  // Cmd+D / Cmd+Shift+D 분할
  const handleKeyDown = useCallback((e) => {
    if (!isActive || !e.metaKey) return
    if (e.key === 'd') {
      e.preventDefault()
      if (e.shiftKey) {
        splitPane(session.id, activePaneId, 'hsplit')
      } else {
        splitPane(session.id, activePaneId, 'vsplit')
      }
    }
    if (e.key === 'w' && e.shiftKey) {
      e.preventDefault()
      const countPanes = (n) => n.type === 'pane' ? 1 : n.children.reduce((a, c) => a + countPanes(c), 0)
      if (countPanes(layout) > 1) {
        closePane(session.id, activePaneId)
      }
    }
  }, [isActive, session.id, activePaneId, layout, splitPane, closePane])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    const poll = async () => {
      const status = await window.electronAPI.getGitStatus(session.cwd)
      if (status) updateSessionGitStatus(session.id, status)
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [session.id, session.cwd, updateSessionGitStatus])

  const getDropZone = (e) => {
    if (!wrapperRef.current) return 'right'
    const rect = wrapperRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const dL = x, dR = 1 - x, dT = y, dB = 1 - y
    const min = Math.min(dL, dR, dT, dB)
    if (min === dL) return 'left'
    if (min === dR) return 'right'
    if (min === dT) return 'top'
    return 'bottom'
  }

  const handleCaptureDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDropZone(getDropZone(e))
  }

  const handleCaptureDragLeave = (e) => {
    if (e.currentTarget && !e.currentTarget.contains(e.relatedTarget)) {
      setDropZone(null)
    }
  }

  const handleCaptureDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const zone = getDropZone(e)
    setDropZone(null)
    if (draggingSessionId && draggingSessionId !== session.id) {
      addSessionToWorkspace(session.id, draggingSessionId, zone)
      setActiveSession(draggingSessionId)
      setDraggingSessionId(null)
    }
  }

  const gitStatus = session.gitStatus

  const style = vis
    ? bounds
      ? {
          display: 'flex',
          position: 'absolute',
          top: `${bounds.y * 100}%`,
          left: `${bounds.x * 100}%`,
          width: `${bounds.w * 100}%`,
          height: `${bounds.h * 100}%`,
        }
      : { display: 'flex' }
    : { display: 'none' }

  return (
    <div
      ref={wrapperRef}
      className={`terminal-wrapper ${bounds ? 'workspace-pane' : ''}`}
      style={style}
    >
      <div className="terminal-header">
        <div className="terminal-header-left">
          <span className="terminal-session-name">{session.name}</span>
          {gitStatus && (
            <span className="terminal-git-status">
              <span className="git-branch-badge">{gitStatus.branch}</span>
              {gitStatus.changed > 0 && (
                <span className="git-changed-badge">M {gitStatus.changed}</span>
              )}
              {gitStatus.ahead > 0 && <span className="git-ahead-badge">↑{gitStatus.ahead}</span>}
              {gitStatus.behind > 0 && <span className="git-behind-badge">↓{gitStatus.behind}</span>}
            </span>
          )}
        </div>
        <div className="terminal-header-right">
          <button
            className={`broadcast-toggle-btn ${broadcastMode ? 'active' : ''}`}
            onClick={toggleBroadcast}
            title="브로드캐스트 모드 (모든 터미널 동시 입력)"
          >
            📡{broadcastMode ? ' ON' : ''}
          </button>
          {settings.snippets?.length > 0 && (
            <div className="snippets-bar">
              {settings.snippets.map((s) => (
                <button
                  key={s.id}
                  className="snippet-btn"
                  onClick={() => window.electronAPI.pty.write(activePaneId, s.command + '\n')}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <span className="terminal-cwd">{session.cwd}</span>
          {bounds && (
            <button
              className="workspace-close-btn"
              title="워크스페이스에서 제거"
              onClick={(e) => {
                e.stopPropagation()
                useStore.getState().removeSessionFromWorkspace(session.id)
              }}
            >✕</button>
          )}
        </div>
      </div>

      <div className="split-area">
        <SplitView node={layout} sessionId={session.id} isVisible={vis} isFocused={isActive} />
      </div>

      {showDragCapture && (
        <div
          className="drag-capture-overlay"
          onDragOver={handleCaptureDragOver}
          onDragLeave={handleCaptureDragLeave}
          onDrop={handleCaptureDrop}
        >
          {dropZone && (
            <div className={`drop-overlay drop-${dropZone}`}>
              <div className="drop-overlay-label">여기에 놓기</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Terminal
