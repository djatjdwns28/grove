import React, { useEffect, useState, useRef } from 'react'
import useStore from '../store'

function UpdateTooltip({ version, releaseNotes, onClose, onDownload }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const cleanNotes = releaseNotes
    ? releaseNotes.replace(/<[^>]*>/g, '').trim()
    : ''

  return (
    <div className="update-tooltip" ref={ref}>
      <div className="update-tooltip-header">
        <span className="update-tooltip-version">v{version} Available</span>
        <button className="update-tooltip-close" onClick={onClose}>✕</button>
      </div>
      <div className="update-tooltip-notes">
        {cleanNotes || 'A new version is available.'}
      </div>
      <button className="update-tooltip-btn" onClick={onDownload}>
        Download from GitHub
      </button>
    </div>
  )
}

function StatusBar() {
  const directories = useStore((s) => s.directories)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const broadcastMode = useStore((s) => s.broadcastMode)
  const toggleBroadcast = useStore((s) => s.toggleBroadcast)
  const [sysInfo, setSysInfo] = useState(null)
  const [updateVersion, setUpdateVersion] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [showTooltip, setShowTooltip] = useState(false)

  const totalSessions = directories.reduce((sum, d) => sum + d.sessions.length, 0)

  const activeSession = directories
    .flatMap((d) => d.sessions)
    .find((s) => s.id === activeSessionId)

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const info = await window.electronAPI.getSystemInfo()
        setSysInfo(info)
      } catch {}
    }
    fetchInfo()
    const interval = setInterval(fetchInfo, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!window.electronAPI.update) return
    window.electronAPI.update.onAvailable((info) => {
      setUpdateVersion(info.version)
      setReleaseNotes(info.releaseNotes || '')
      setShowTooltip(true)
    })
  }, [])

  const handleDownload = () => {
    window.electronAPI.openExternal(
      `https://github.com/djatjdwns28/grove/releases/tag/v${updateVersion}`
    )
    setShowTooltip(false)
  }

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-item">
          <span className="status-icon">⬡</span>
          Sessions {totalSessions}
        </span>
        {activeSession && (
          <span className="status-item status-active-session">
            {activeSession.gitStatus?.branch && (
              <span className="status-branch">{activeSession.gitStatus.branch}</span>
            )}
          </span>
        )}
      </div>
      <div className="status-right">
        {updateVersion && (
          <div className="status-update-wrapper">
            {showTooltip && (
              <UpdateTooltip
                version={updateVersion}
                releaseNotes={releaseNotes}
                onClose={() => setShowTooltip(false)}
                onDownload={handleDownload}
              />
            )}
            <button
              className="status-update-btn"
              onClick={() => setShowTooltip((p) => !p)}
            >
              v{updateVersion} Update
            </button>
          </div>
        )}
        <button
          className={`status-broadcast-btn ${broadcastMode ? 'active' : ''}`}
          onClick={toggleBroadcast}
          title="Broadcast mode (simultaneous input to all terminals)"
        >
          {broadcastMode ? '📡 BROADCAST ON' : '📡'}
        </button>
        {sysInfo && (
          <>
            <span className="status-item status-mem">
              MEM {sysInfo.usedMemPercent}%
            </span>
            <span className="status-item status-platform">
              {sysInfo.hostname}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export default StatusBar
