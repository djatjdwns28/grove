import React, { useEffect, useState } from 'react'
import useStore from '../store'

function StatusBar() {
  const directories = useStore((s) => s.directories)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const broadcastMode = useStore((s) => s.broadcastMode)
  const toggleBroadcast = useStore((s) => s.toggleBroadcast)
  const [sysInfo, setSysInfo] = useState(null)

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

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-item">
          <span className="status-icon">⬡</span>
          세션 {totalSessions}
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
        <button
          className={`status-broadcast-btn ${broadcastMode ? 'active' : ''}`}
          onClick={toggleBroadcast}
          title="브로드캐스트 모드 (모든 터미널 동시 입력)"
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
