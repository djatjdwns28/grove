import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import useStore from '../store'
import { getThemeColors } from '../themes'

function TerminalPane({ paneId, cwd, isVisible, isFocused, sessionId, onFocus }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitAddonRef = useRef(null)
  const searchAddonRef = useRef(null)
  const searchInputRef = useRef(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const settings = useStore((s) => s.settings)

  // Safe fit call: only when the container is visible and has dimensions
  const safeFit = () => {
    try {
      const el = containerRef.current
      if (!el || !fitAddonRef.current || !termRef.current) return
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return
      fitAddonRef.current.fit()
    } catch {}
  }

  // xterm initialization
  useEffect(() => {
    if (!containerRef.current) return

    const s = useStore.getState().settings
    const themeColors = getThemeColors(s.themeName, s.customColors)

    const term = new XTerm({
      theme: themeColors,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      cursorBlink: s.cursorBlink,
      scrollback: s.scrollback,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const unicode11 = new Unicode11Addon()
    const searchAddon = new SearchAddon()
    const webLinksAddon = new WebLinksAddon((e, uri) => {
      window.electronAPI.openExternal(uri)
    })
    term.loadAddon(fitAddon)
    term.loadAddon(unicode11)
    term.loadAddon(searchAddon)
    term.loadAddon(webLinksAddon)
    term.unicode.activeVersion = '11'
    term.open(containerRef.current)

    // Click file path -> open in editor (file:line:col)
    const filePathRegex = /((?:\/|\.\/|\.\.\/)?(?:[\w@.-]+\/)*[\w@.-]+\.[a-zA-Z]{1,5}):(\d+)(?::(\d+))?/g
    const codeExts = new Set(['js','jsx','ts','tsx','mjs','cjs','py','rb','go','rs','java','c','cpp','h','hpp','css','scss','less','html','vue','svelte','json','yaml','yml','toml','md','txt','sh','bash','zsh','swift','kt','php','ex','exs','lua','zig','ml','mli','tf','sql','graphql','gql','prisma','proto'])

    term.registerLinkProvider({
      provideLinks: (lineNumber, callback) => {
        const line = term.buffer.active.getLine(lineNumber)
        if (!line) { callback(undefined); return }
        const text = line.translateToString()
        const links = []
        let m
        filePathRegex.lastIndex = 0
        while ((m = filePathRegex.exec(text)) !== null) {
          const filePath = m[1]
          const lineNum = m[2]
          const col = m[3]
          const ext = filePath.split('.').pop()?.toLowerCase()
          if (!codeExts.has(ext)) continue
          const startX = m.index + 1
          const endX = m.index + m[0].length + 1
          links.push({
            range: { start: { x: startX, y: lineNumber }, end: { x: endX, y: lineNumber } },
            text: m[0],
            activate: () => {
              window.electronAPI.openInEditor({
                filePath, line: parseInt(lineNum, 10), col: col ? parseInt(col, 10) : 1, cwd,
              })
            },
          })
        }
        callback(links.length > 0 ? links : undefined)
      },
    })

    termRef.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // Initial fit — run after the container has rendered
    requestAnimationFrame(() => safeFit())

    window.electronAPI.pty.create({ id: paneId, cwd }).then(() => {
      let busySince = null
      let idleTimer = null

      const removeData = window.electronAPI.pty.onData(paneId, (data) => {
        term.write(data)

        // Activity tracking for completion notification
        const s = useStore.getState().settings
        if (!s.notifyOnComplete) return

        if (!busySince) busySince = Date.now()

        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          if (!busySince) return
          const elapsed = (Date.now() - busySince) / 1000
          busySince = null
          if (elapsed < (s.notifyIdleSeconds || 3)) return

          const currentActive = useStore.getState().activeSessionId
          if (currentActive !== sessionId) {
            const dir = useStore.getState().directories.find((d) =>
              d.sessions.some((ss) => ss.id === sessionId)
            )
            const session = dir?.sessions.find((ss) => ss.id === sessionId)
            const name = session?.name || 'Terminal'
            window.electronAPI.showNotification('Command completed', `"${name}" is ready`)
          }
        }, (s.notifyIdleSeconds || 3) * 1000)
      })

      window.electronAPI.pty.onExit(paneId, () => {
        clearTimeout(idleTimer)
        busySince = null
        term.write('\r\n\x1b[2m[Process exited]\x1b[0m\r\n')
        const currentActive = useStore.getState().activeSessionId
        if (currentActive !== sessionId) {
          window.electronAPI.showNotification('Command completed', 'Process has exited')
        }
      })

      term.onData((data) => {
        const state = useStore.getState()
        if (state.broadcastMode) {
          // Broadcast: forward input to all panes of all sessions
          const collectPaneIds = (node) => {
            if (!node) return []
            if (node.type === 'pane') return [node.id]
            return (node.children || []).flatMap(collectPaneIds)
          }
          const allPaneIds = state.directories.flatMap((d) =>
            d.sessions.flatMap((s) => collectPaneIds(s.layout || { type: 'pane', id: s.id }))
          )
          allPaneIds.forEach((id) => window.electronAPI.pty.write(id, data))
        } else {
          window.electronAPI.pty.write(paneId, data)
        }
      })

      const ro = new ResizeObserver(() => {
        safeFit()
        if (termRef.current) {
          try {
            window.electronAPI.pty.resize(paneId, termRef.current.cols, termRef.current.rows)
          } catch {}
        }
      })
      ro.observe(containerRef.current)

      term._cleanup = () => { removeData(); ro.disconnect(); clearTimeout(idleTimer) }
    })

    // Focus on click
    term.onData(() => onFocus?.())

    return () => {
      term._cleanup?.()
      termRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
      term.dispose()
    }
  }, [paneId, cwd])

  // Settings change
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const themeColors = getThemeColors(settings.themeName, settings.customColors)
    term.options.theme = themeColors
    term.options.fontFamily = settings.fontFamily
    term.options.fontSize = settings.fontSize
    term.options.lineHeight = settings.lineHeight
    term.options.cursorBlink = settings.cursorBlink
    term.options.scrollback = settings.scrollback
    requestAnimationFrame(() => {
      safeFit()
      if (termRef.current) {
        try {
          window.electronAPI.pty.resize(paneId, termRef.current.cols, termRef.current.rows)
        } catch {}
      }
    })
  }, [settings, paneId])

  // Fit when visible
  useEffect(() => {
    if (!isVisible) return
    requestAnimationFrame(() => {
      safeFit()
      if (termRef.current) {
        try {
          window.electronAPI.pty.resize(paneId, termRef.current.cols, termRef.current.rows)
        } catch {}
      }
    })
  }, [isVisible, paneId])

  // Focus terminal when focused
  useEffect(() => {
    if (isFocused && isVisible) {
      setTimeout(() => termRef.current?.focus(), 50)
    }
  }, [isFocused, isVisible])

  // Cmd+F
  useEffect(() => {
    if (!isFocused || !isVisible) return
    const handler = (e) => {
      if (e.metaKey && e.key === 'f') {
        e.preventDefault()
        setShowSearch((prev) => {
          if (!prev) setTimeout(() => searchInputRef.current?.focus(), 50)
          return !prev
        })
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false)
        try { searchAddonRef.current?.clearDecorations() } catch {}
        termRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isFocused, isVisible, showSearch])

  const safeSearch = (fn) => { try { fn() } catch {} }

  const handleSearch = (value) => {
    setSearchQuery(value)
    safeSearch(() => {
      if (value) searchAddonRef.current?.findNext(value)
      else searchAddonRef.current?.clearDecorations()
    })
  }

  const handleRunSnippet = (cmd) => {
    window.electronAPI.pty.write(paneId, cmd + '\n')
    termRef.current?.focus()
  }

  return (
    <div className={`pane-wrapper ${isFocused ? 'pane-focused' : ''}`} onClick={onFocus}>
      {showSearch && (
        <div className="search-bar">
          <input
            ref={searchInputRef}
            className="search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') safeSearch(() => e.shiftKey ? searchAddonRef.current?.findPrevious(searchQuery) : searchAddonRef.current?.findNext(searchQuery))
              if (e.key === 'Escape') { setShowSearch(false); try { searchAddonRef.current?.clearDecorations() } catch {}; termRef.current?.focus() }
            }}
          />
          <button className="search-nav-btn" onClick={() => safeSearch(() => searchAddonRef.current?.findPrevious(searchQuery))}>▲</button>
          <button className="search-nav-btn" onClick={() => safeSearch(() => searchAddonRef.current?.findNext(searchQuery))}>▼</button>
          <button className="search-nav-btn" onClick={() => { setShowSearch(false); try { searchAddonRef.current?.clearDecorations() } catch {}; termRef.current?.focus() }}>✕</button>
        </div>
      )}
      <div ref={containerRef} className="terminal-container" />
    </div>
  )
}

export default TerminalPane
