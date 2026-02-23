import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'

function ConfirmModal({ message, onConfirm, onCancel }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Enter') onConfirm()
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onConfirm, onCancel])

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-message">{message}</div>
        <div className="confirm-buttons">
          <button className="confirm-btn cancel" onClick={onCancel}>Cancel</button>
          <button className="confirm-btn danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function BranchPicker({ branches, worktrees, pos, onSelect, onClose, creating }) {
  const ref = useRef(null)
  const searchRef = useRef(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => { searchRef.current?.focus() }, [])

  const wtByBranch = Object.fromEntries(
    worktrees.filter((wt) => wt.branch).map((wt) => [wt.branch, wt])
  )

  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(query.toLowerCase())
  )

  const withWorktree = filtered.filter((b) => wtByBranch[b.name])
  const withoutWorktree = filtered.filter((b) => !wtByBranch[b.name])

  const renderItem = (b) => {
    const wt = wtByBranch[b.name]
    return (
      <div key={b.name} className="wt-picker-item" onClick={() => onSelect(b)}>
        <span className="wt-branch">{b.name}</span>
        {wt ? (
          <span className="wt-badge has-wt" title={wt.path}>Existing worktree</span>
        ) : (
          <span className="wt-badge no-wt">+ Create worktree</span>
        )}
      </div>
    )
  }

  return (
    <div
      className="wt-picker"
      ref={ref}
      style={{ position: 'fixed', top: pos.bottom + 4, left: pos.left }}
    >
      <div className="wt-picker-header">
        <span className="wt-picker-title">Select Branch</span>
        <input
          ref={searchRef}
          className="wt-picker-search"
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {creating ? (
        <div className="wt-picker-loading">Creating worktree...</div>
      ) : (
        <div className="wt-picker-list">
          {filtered.length === 0 ? (
            <div className="wt-picker-empty">No results</div>
          ) : (
            <>
              {withWorktree.length > 0 && (
                <>
                  <div className="wt-picker-section">Open worktrees</div>
                  {withWorktree.map(renderItem)}
                  {withoutWorktree.length > 0 && <div className="wt-picker-divider" />}
                </>
              )}
              {withoutWorktree.length > 0 && (
                <>
                  {withWorktree.length > 0 && <div className="wt-picker-section">Branches</div>}
                  {withoutWorktree.map(renderItem)}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Sidebar({ onOpenSettings, style }) {
  const {
    directories,
    addDirectory,
    removeDirectory,
    addSession,
    removeSession,
    setActiveSession,
    toggleDirectory,
    updateSessionName,
    reorderSessions,
    reorderDirectories,
    activeSessionId,
    setDraggingSessionId,
    cloneSession,
  } = useStore()

  const [pickerState, setPickerState] = useState(null)
  const [creatingWorktree, setCreatingWorktree] = useState(null)
  const [editingSession, setEditingSession] = useState(null)
  const [editName, setEditName] = useState('')
  const editInputRef = useRef(null)
  const [dragSession, setDragSession] = useState(null)
  const [dragDir, setDragDir] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)

  useEffect(() => {
    if (editingSession) editInputRef.current?.select()
  }, [editingSession])

  const uniqueName = (base, existingNames) => {
    if (!existingNames.includes(base)) return base
    let i = 2
    while (existingNames.includes(`${base}-${i}`)) i++
    return `${base}-${i}`
  }

  const handleAddDirectory = async () => {
    const dirPath = await window.electronAPI.openDirectory()
    if (!dirPath) return

    const dirId = addDirectory(dirPath)

    const { worktrees, isGit } = await window.electronAPI.getGitWorktrees(dirPath)
    if (isGit && worktrees.length > 0) {
      const main = worktrees.find((wt) => wt.path === dirPath) || worktrees[0]
      addSession(dirId, main.branch || 'main', main.path)
    }
  }

  const handleAddSession = async (e, dir) => {
    e.stopPropagation()
    const btnRect = e.currentTarget.getBoundingClientRect()

    const { isGit, branches } = await window.electronAPI.getAllBranches(dir.path)

    if (!isGit || branches.length === 0) {
      const existing = dir.sessions.map((s) => s.name)
      addSession(dir.id, uniqueName('session', existing), dir.path)
      return
    }

    const { worktrees } = await window.electronAPI.getGitWorktrees(dir.path)
    setPickerState({
      dirId: dir.id,
      dirPath: dir.path,
      branches,
      worktrees,
      pos: { bottom: btnRect.bottom, left: btnRect.left },
    })
  }

  const handleDeleteWorktree = async (e, dir, session) => {
    e.stopPropagation()
    if (session.cwd === dir.path) {
      alert('Cannot delete main worktree.')
      return
    }
    setConfirmAction({
      message: `Delete worktree?\n${session.cwd}`,
      onConfirm: async () => {
        setConfirmAction(null)
        removeSession(dir.id, session.id)
        const result = await window.electronAPI.removeGitWorktree({
          repoPath: dir.path,
          worktreePath: session.cwd,
        })
        if (!result.success) {
          alert(`Worktree deletion failed:\n${result.error}`)
        }
      },
    })
  }

  const handlePickBranch = async (branch) => {
    if (!pickerState) return
    const { dirId, dirPath, worktrees } = pickerState

    const existingWt = worktrees.find((wt) => wt.branch === branch.name)

    let worktreePath
    if (existingWt) {
      worktreePath = existingWt.path
    } else {
      setCreatingWorktree(branch.name)
      const result = await window.electronAPI.addGitWorktree({
        repoPath: dirPath,
        branch: branch.name,
      })
      setCreatingWorktree(null)

      if (!result.success) {
        alert(`Worktree creation failed:\n${result.error}`)
        setPickerState(null)
        return
      }
      worktreePath = result.path
    }

    const freshDir = useStore.getState().directories.find((d) => d.id === dirId)
    const existing = freshDir?.sessions.map((s) => s.name) || []
    const name = uniqueName(branch.name, existing)

    addSession(dirId, name, worktreePath)
    setPickerState(null)
  }

  // Feature 2: Rename session
  const handleDoubleClick = (e, dirId, session) => {
    e.stopPropagation()
    setEditingSession({ dirId, sessionId: session.id })
    setEditName(session.name)
  }

  const commitRename = () => {
    if (editingSession && editName.trim()) {
      updateSessionName(editingSession.dirId, editingSession.sessionId, editName.trim())
    }
    setEditingSession(null)
  }

  // Feature 6: Session drag
  const handleSessionDragStart = (e, dirId, idx, sessionId) => {
    setDragSession({ dirId, idx })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/session-id', sessionId)
    setDraggingSessionId(sessionId)
  }

  const handleSessionDragEnd = () => {
    setDragSession(null)
    setDraggingSessionId(null)
  }

  const handleSessionDragOver = (e) => {
    e.preventDefault()
    e.currentTarget.classList.add('drag-over')
  }

  const handleSessionDragLeave = (e) => {
    e.currentTarget.classList.remove('drag-over')
  }

  const handleSessionDrop = (e, dirId, toIdx) => {
    e.currentTarget.classList.remove('drag-over')
    if (dragSession && dragSession.dirId === dirId && dragSession.idx !== toIdx) {
      reorderSessions(dirId, dragSession.idx, toIdx)
    }
    setDragSession(null)
  }

  // Feature 6: Directory drag
  const handleDirDragStart = (e, idx) => {
    setDragDir(idx)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDirDragOver = (e) => {
    e.preventDefault()
    e.currentTarget.classList.add('drag-over')
  }

  const handleDirDragLeave = (e) => {
    e.currentTarget.classList.remove('drag-over')
  }

  const handleDirDrop = (e, toIdx) => {
    e.currentTarget.classList.remove('drag-over')
    if (dragDir !== null && dragDir !== toIdx) {
      reorderDirectories(dragDir, toIdx)
    }
    setDragDir(null)
  }

  return (
    <div className="sidebar" style={style}>
      {pickerState && (
        <BranchPicker
          branches={pickerState.branches}
          worktrees={pickerState.worktrees}
          pos={pickerState.pos}
          onSelect={handlePickBranch}
          onClose={() => !creatingWorktree && setPickerState(null)}
          creating={creatingWorktree}
        />
      )}
      <div className="sidebar-header">Worktree Terminal</div>

      <div className="directory-list">
        {directories.map((dir, dirIdx) => (
          <div
            key={dir.id}
            className="dir-block"
            draggable
            onDragStart={(e) => handleDirDragStart(e, dirIdx)}
            onDragOver={handleDirDragOver}
            onDragLeave={handleDirDragLeave}
            onDrop={(e) => handleDirDrop(e, dirIdx)}
          >
            <div className="dir-row" onClick={() => toggleDirectory(dir.id)}>
              <span className="chevron">{dir.expanded ? '▾' : '▸'}</span>
              <span className="dir-name" title={dir.path}>{dir.name}</span>
              <div className="row-actions">
                <button
                  className="icon-btn"
                  title="Add new session"
                  onClick={(e) => handleAddSession(e, dir)}
                >+</button>
                <button
                  className="icon-btn danger"
                  title="Remove directory"
                  onClick={(e) => { e.stopPropagation(); removeDirectory(dir.id) }}
                >×</button>
              </div>
            </div>

            {dir.expanded && (
              <div className="session-list">
                {dir.sessions.map((session, sIdx) => (
                  <div
                    key={session.id}
                    className={`session-row ${session.id === activeSessionId ? 'active' : ''}`}
                    onClick={() => setActiveSession(session.id)}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); handleSessionDragStart(e, dir.id, sIdx, session.id) }}
                    onDragEnd={handleSessionDragEnd}
                    onDragOver={(e) => { e.stopPropagation(); handleSessionDragOver(e) }}
                    onDragLeave={handleSessionDragLeave}
                    onDrop={(e) => { e.stopPropagation(); handleSessionDrop(e, dir.id, sIdx) }}
                  >
                    <span className="dot">●</span>
                    {editingSession?.sessionId === session.id ? (
                      <input
                        ref={editInputRef}
                        className="session-rename-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingSession(null) }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="session-name"
                        onDoubleClick={(e) => handleDoubleClick(e, dir.id, session)}
                      >
                        {session.name}
                      </span>
                    )}
                    {session.gitStatus?.changed > 0 && (
                      <span className="session-git-badge">{session.gitStatus.changed}</span>
                    )}
                    <button
                      className="icon-btn clone-btn"
                      title="Clone session"
                      onClick={(e) => { e.stopPropagation(); cloneSession(dir.id, session.id) }}
                    >⧉</button>
                    <button
                      className="wt-delete-btn"
                      onClick={(e) => handleDeleteWorktree(e, dir, session)}
                    >Delete</button>
                    <button
                      className="icon-btn danger"
                      title="Remove session"
                      onClick={(e) => { e.stopPropagation(); removeSession(dir.id, session.id) }}
                    >×</button>
                  </div>
                ))}
                {dir.sessions.length === 0 && (
                  <div className="no-sessions">No sessions — click + to add</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-footer-row">
          <button className="add-dir-btn" onClick={handleAddDirectory}>
            + Add Directory
          </button>
          <button className="settings-gear-btn" title="Settings" onClick={onOpenSettings}>
            ⚙
          </button>
        </div>
      </div>
      {confirmAction && (
        <ConfirmModal
          message={confirmAction.message}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}

export default Sidebar
