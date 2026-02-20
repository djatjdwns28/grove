import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store'

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
          <span className="wt-badge has-wt" title={wt.path}>기존 워크트리</span>
        ) : (
          <span className="wt-badge no-wt">+ 워크트리 생성</span>
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
        <span className="wt-picker-title">브랜치 선택</span>
        <input
          ref={searchRef}
          className="wt-picker-search"
          placeholder="검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {creating ? (
        <div className="wt-picker-loading">워크트리 생성 중...</div>
      ) : (
        <div className="wt-picker-list">
          {filtered.length === 0 ? (
            <div className="wt-picker-empty">검색 결과 없음</div>
          ) : (
            <>
              {withWorktree.length > 0 && (
                <>
                  <div className="wt-picker-section">열린 워크트리</div>
                  {withWorktree.map(renderItem)}
                  {withoutWorktree.length > 0 && <div className="wt-picker-divider" />}
                </>
              )}
              {withoutWorktree.length > 0 && (
                <>
                  {withWorktree.length > 0 && <div className="wt-picker-section">브랜치</div>}
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

function Sidebar({ onOpenSettings }) {
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
      alert('메인 워크트리는 삭제할 수 없습니다.')
      return
    }
    const ok = confirm(`워크트리를 삭제할까요?\n${session.cwd}`)
    if (!ok) return

    removeSession(dir.id, session.id)
    const result = await window.electronAPI.removeGitWorktree({
      repoPath: dir.path,
      worktreePath: session.cwd,
    })
    if (!result.success) {
      alert(`워크트리 삭제 실패:\n${result.error}`)
    }
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
        alert(`워크트리 생성 실패:\n${result.error}`)
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

  // 기능 2: 세션 이름 변경
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

  // 기능 6: 세션 드래그
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

  // 기능 6: 디렉토리 드래그
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
    <div className="sidebar">
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
                  title="새 세션 추가"
                  onClick={(e) => handleAddSession(e, dir)}
                >+</button>
                <button
                  className="icon-btn danger"
                  title="디렉토리 제거"
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
                      title="세션 복제"
                      onClick={(e) => { e.stopPropagation(); cloneSession(dir.id, session.id) }}
                    >⧉</button>
                    <button
                      className="wt-delete-btn"
                      onClick={(e) => handleDeleteWorktree(e, dir, session)}
                    >삭제</button>
                    <button
                      className="icon-btn danger"
                      title="세션 제거"
                      onClick={(e) => { e.stopPropagation(); removeSession(dir.id, session.id) }}
                    >×</button>
                  </div>
                ))}
                {dir.sessions.length === 0 && (
                  <div className="no-sessions">세션 없음 — + 클릭해서 추가</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-footer-row">
          <button className="add-dir-btn" onClick={handleAddDirectory}>
            + 디렉토리 추가
          </button>
          <button className="settings-gear-btn" title="설정" onClick={onOpenSettings}>
            ⚙
          </button>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
