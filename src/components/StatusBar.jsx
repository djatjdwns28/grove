import React, { useEffect, useState, useRef } from 'react'
import useStore from '../store'

function UpdateTooltip({ version, releaseNotes, onClose, onUpdate }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Strip HTML tags from release notes
  const cleanNotes = releaseNotes
    ? releaseNotes.replace(/<[^>]*>/g, '').trim()
    : ''

  return (
    <div className="update-tooltip" ref={ref}>
      <div className="update-tooltip-header">
        <span className="update-tooltip-version">v{version} Available</span>
        <button className="update-tooltip-close" onClick={onClose}>✕</button>
      </div>
      {cleanNotes && (
        <div className="update-tooltip-notes">{cleanNotes}</div>
      )}
      {!cleanNotes && (
        <div className="update-tooltip-notes">A new version is available.</div>
      )}
      <button className="update-tooltip-btn" onClick={onUpdate}>
        Download Update
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
  const [updateState, setUpdateState] = useState(null)
  const [updateVersion, setUpdateVersion] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [downloadPercent, setDownloadPercent] = useState(0)
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
      setUpdateState('available')
      setShowTooltip(true)
    })
    window.electronAPI.update.onProgress((percent) => {
      setDownloadPercent(percent)
    })
    window.electronAPI.update.onDownloaded(() => {
      setUpdateState('ready')
    })
    window.electronAPI.update.onError?.((msg) => {
      console.error('Update error:', msg)
      setUpdateState('error')
    })
  }, [])

  const handleUpdate = () => {
    if (updateState === 'available') {
      setUpdateState('downloading')
      setShowTooltip(false)
      window.electronAPI.update.download()
    } else if (updateState === 'ready') {
      window.electronAPI.update.install()
    }
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
        {updateState && (
          <div className="status-update-wrapper">
            {showTooltip && updateState === 'available' && (
              <UpdateTooltip
                version={updateVersion}
                releaseNotes={releaseNotes}
                onClose={() => setShowTooltip(false)}
                onUpdate={handleUpdate}
              />
            )}
            <button
              className="status-update-btn"
              onClick={updateState === 'available' ? () => setShowTooltip((p) => !p) : handleUpdate}
            >
              {updateState === 'available' && `v${updateVersion} Update`}
              {updateState === 'downloading' && `Downloading ${downloadPercent}%`}
              {updateState === 'ready' && 'Restart to update'}
              {updateState === 'error' && 'Update failed'}
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
