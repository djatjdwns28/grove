import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

const defaultSettings = {
  fontFamily: '"D2CodingLigature Nerd Font", "D2Coding", Menlo, monospace',
  fontSize: 13,
  lineHeight: 1.3,
  cursorBlink: true,
  scrollback: 5000,
  themeName: 'catppuccin-mocha',
  customColors: null,
  snippets: [],
  notifyOnComplete: true,
  notifyIdleSeconds: 3,
  defaultShell: '',
}

const updateNodeSizes = (node, path, sizes) => {
  if (path.length === 0) return { ...node, sizes }
  const [idx, ...rest] = path
  return {
    ...node,
    children: node.children.map((child, i) =>
      i === idx ? updateNodeSizes(child, rest, sizes) : child
    ),
  }
}

const useStore = create(
  persist(
    (set, get) => ({
      directories: [],
      activeSessionId: null,
      recentlyClosed: [],
      settings: { ...defaultSettings },

      updateSettings: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),

      resetSettings: () => set({ settings: { ...defaultSettings } }),

      addDirectory: (path) => {
        const name = path.split('/').pop() || path
        const newDir = { id: uuidv4(), path, name, expanded: true, sessions: [] }
        set((s) => ({ directories: [...s.directories, newDir] }))
        return newDir.id
      },

      removeDirectory: (dirId) => {
        const dir = get().directories.find((d) => d.id === dirId)
        dir?.sessions.forEach((s) => window.electronAPI?.pty.kill(s.id))
        const removedIds = new Set(dir?.sessions.map((s) => s.id) || [])

        const pruneLayout = (node) => {
          if (!node) return null
          if (node.type === 'session') return removedIds.has(node.sessionId) ? null : node
          const children = node.children.map(pruneLayout).filter(Boolean)
          if (children.length === 0) return null
          if (children.length === 1) return children[0]
          return { ...node, children }
        }

        set((s) => {
          let wl = pruneLayout(s.workspaceLayout)
          if (wl?.type === 'session') wl = null
          let swl = pruneLayout(s.savedWorkspaceLayout)
          if (swl?.type === 'session') swl = null

          return {
            directories: s.directories.filter((d) => d.id !== dirId),
            activeSessionId: removedIds.has(s.activeSessionId) ? null : s.activeSessionId,
            workspaceLayout: wl,
            savedWorkspaceLayout: swl,
          }
        })
      },

      addSession: (dirId, name, cwd) => {
        const id = uuidv4()
        set((s) => ({
          directories: s.directories.map((d) =>
            d.id === dirId ? { ...d, sessions: [...d.sessions, {
              id, name, cwd,
              layout: { type: 'pane', id, cwd },
              activePaneId: id,
            }] } : d
          ),
          activeSessionId: id,
        }))
        return id
      },

      // Split related
      splitPane: (sessionId, paneId, direction) => {
        const newPaneId = uuidv4()
        const insertSplit = (node) => {
          if (node.type === 'pane' && node.id === paneId) {
            return {
              type: direction,
              children: [node, { type: 'pane', id: newPaneId, cwd: node.cwd }],
            }
          }
          if (node.children) {
            return { ...node, children: node.children.map(insertSplit) }
          }
          return node
        }
        set((s) => ({
          directories: s.directories.map((d) => ({
            ...d,
            sessions: d.sessions.map((ss) => {
              if (ss.id !== sessionId) return ss
              return { ...ss, layout: insertSplit(ss.layout || { type: 'pane', id: ss.id, cwd: ss.cwd }), activePaneId: newPaneId }
            }),
          })),
        }))
        return newPaneId
      },

      closePane: (sessionId, paneId) => {
        window.electronAPI?.pty.kill(paneId)
        const removeNode = (node) => {
          if (node.type === 'pane') return node.id === paneId ? null : node
          const children = node.children.map(removeNode).filter(Boolean)
          if (children.length === 0) return null
          if (children.length === 1) return children[0]
          return { ...node, children }
        }
        const getFirst = (node) => {
          if (node.type === 'pane') return node.id
          return getFirst(node.children[0])
        }
        set((s) => ({
          directories: s.directories.map((d) => ({
            ...d,
            sessions: d.sessions.map((ss) => {
              if (ss.id !== sessionId) return ss
              const layout = removeNode(ss.layout)
              if (!layout) return ss
              const activePaneId = ss.activePaneId === paneId ? getFirst(layout) : ss.activePaneId
              return { ...ss, layout, activePaneId }
            }),
          })),
        }))
      },

      setActivePaneId: (sessionId, paneId) =>
        set((s) => ({
          directories: s.directories.map((d) => ({
            ...d,
            sessions: d.sessions.map((ss) =>
              ss.id === sessionId ? { ...ss, activePaneId: paneId } : ss
            ),
          })),
        })),

      removeSession: (dirId, sessionId) => {
        // kill all panes in layout
        const killAll = (node) => {
          if (!node) return
          if (node.type === 'pane') { window.electronAPI?.pty.kill(node.id); return }
          node.children?.forEach(killAll)
        }
        const dir = get().directories.find((d) => d.id === dirId)
        const session = dir?.sessions.find((ss) => ss.id === sessionId)
        if (session?.layout) killAll(session.layout)
        else window.electronAPI?.pty.kill(sessionId)
        set((s) => {
          const dir = s.directories.find((d) => d.id === dirId)
          const closed = dir?.sessions.find((ss) => ss.id === sessionId)
          const remaining = dir?.sessions.filter((ss) => ss.id !== sessionId) || []
          const newActive =
            s.activeSessionId === sessionId
              ? (remaining[remaining.length - 1]?.id || null)
              : s.activeSessionId
          const recentlyClosed = closed
            ? [{ dirId, name: closed.name, cwd: closed.cwd, closedAt: Date.now() }, ...s.recentlyClosed].slice(0, 10)
            : s.recentlyClosed
          // Clean up workspace layout
          const pruneWs = (node) => {
            if (node.type === 'session') return node.sessionId === sessionId ? null : node
            const children = node.children.map(pruneWs).filter(Boolean)
            if (children.length === 0) return null
            if (children.length === 1) return children[0]
            return { ...node, children }
          }
          let newWorkspaceLayout = s.workspaceLayout ? pruneWs(s.workspaceLayout) : null
          if (newWorkspaceLayout?.type === 'session') newWorkspaceLayout = null

          let newSavedWorkspaceLayout = s.savedWorkspaceLayout ? pruneWs(s.savedWorkspaceLayout) : null
          if (newSavedWorkspaceLayout?.type === 'session') newSavedWorkspaceLayout = null

          return {
            directories: s.directories.map((d) =>
              d.id === dirId ? { ...d, sessions: remaining } : d
            ),
            activeSessionId: newActive,
            recentlyClosed,
            workspaceLayout: newWorkspaceLayout,
            savedWorkspaceLayout: newSavedWorkspaceLayout,
          }
        })
      },

      restoreSession: (index) => {
        const { recentlyClosed, directories } = get()
        const item = recentlyClosed[index]
        if (!item) return
        const dir = directories.find((d) => d.id === item.dirId)
        if (!dir) return
        const id = uuidv4()
        set((s) => ({
          directories: s.directories.map((d) =>
            d.id === item.dirId ? { ...d, sessions: [...d.sessions, { id, name: item.name, cwd: item.cwd }] } : d
          ),
          activeSessionId: id,
          recentlyClosed: s.recentlyClosed.filter((_, i) => i !== index),
        }))
      },

      setActiveSession: (id) => {
        const state = get()
        const isIn = (node, sid) => {
          if (!node) return false
          if (node.type === 'session') return node.sessionId === sid
          return node.children?.some(c => isIn(c, sid)) || false
        }

        if (state.workspaceLayout) {
          if (isIn(state.workspaceLayout, id)) {
            set({ activeSessionId: id })
          } else {
            set({ activeSessionId: id, workspaceLayout: null, savedWorkspaceLayout: state.workspaceLayout })
          }
          return
        }

        if (state.savedWorkspaceLayout && isIn(state.savedWorkspaceLayout, id)) {
          set({ activeSessionId: id, workspaceLayout: state.savedWorkspaceLayout, savedWorkspaceLayout: null })
          return
        }

        set({ activeSessionId: id })
      },

      toggleDirectory: (dirId) =>
        set((s) => ({
          directories: s.directories.map((d) =>
            d.id === dirId ? { ...d, expanded: !d.expanded } : d
          ),
        })),

      // Feature 2: Rename session
      updateSessionName: (dirId, sessionId, newName) =>
        set((s) => ({
          directories: s.directories.map((d) =>
            d.id === dirId
              ? { ...d, sessions: d.sessions.map((ss) =>
                  ss.id === sessionId ? { ...ss, name: newName } : ss
                )}
              : d
          ),
        })),

      // Feature 3: Git status update
      updateSessionGitStatus: (sessionId, gitStatus) =>
        set((s) => ({
          directories: s.directories.map((d) => ({
            ...d,
            sessions: d.sessions.map((ss) =>
              ss.id === sessionId ? { ...ss, gitStatus } : ss
            ),
          })),
        })),

      // Feature 6: Reorder sessions
      reorderSessions: (dirId, fromIdx, toIdx) =>
        set((s) => ({
          directories: s.directories.map((d) => {
            if (d.id !== dirId) return d
            const sessions = [...d.sessions]
            const [item] = sessions.splice(fromIdx, 1)
            sessions.splice(toIdx, 0, item)
            return { ...d, sessions }
          }),
        })),

      // Feature 6: Reorder directories
      reorderDirectories: (fromIdx, toIdx) =>
        set((s) => {
          const dirs = [...s.directories]
          const [item] = dirs.splice(fromIdx, 1)
          dirs.splice(toIdx, 0, item)
          return { directories: dirs }
        }),

      // Broadcast mode
      broadcastMode: false,
      toggleBroadcast: () => set((s) => ({ broadcastMode: !s.broadcastMode })),

      // Clone session
      cloneSession: (dirId, sessionId) => {
        const state = get()
        const dir = state.directories.find((d) => d.id === dirId)
        const session = dir?.sessions.find((s) => s.id === sessionId)
        if (!session) return null
        const id = uuidv4()
        const name = session.name + ' (copy)'
        set((s) => ({
          directories: s.directories.map((d) =>
            d.id === dirId ? { ...d, sessions: [...d.sessions, {
              id, name, cwd: session.cwd,
              layout: { type: 'pane', id, cwd: session.cwd },
              activePaneId: id,
            }] } : d
          ),
          activeSessionId: id,
        }))
        return id
      },

      // Workspace split (view multiple sessions simultaneously)
      workspaceLayout: null,
      savedWorkspaceLayout: null,
      draggingSessionId: null,
      setDraggingSessionId: (id) => set({ draggingSessionId: id }),

      addSessionToWorkspace: (targetSessionId, newSessionId, zone) => {
        const state = get()
        const direction = (zone === 'left' || zone === 'right') ? 'vsplit' : 'hsplit'
        const insertBefore = zone === 'left' || zone === 'top'

        const isInLayout = (node, sid) => {
          if (!node) return false
          if (node.type === 'session') return node.sessionId === sid
          return node.children?.some(c => isInLayout(c, sid)) || false
        }
        if (state.workspaceLayout && isInLayout(state.workspaceLayout, newSessionId)) return

        const newNode = { type: 'session', sessionId: newSessionId }

        if (!state.workspaceLayout) {
          const targetNode = { type: 'session', sessionId: targetSessionId }
          const children = insertBefore ? [newNode, targetNode] : [targetNode, newNode]
          set({ workspaceLayout: { type: direction, children }, activeSessionId: newSessionId, savedWorkspaceLayout: null })
          return
        }

        const insertSplit = (node) => {
          if (node.type === 'session' && node.sessionId === targetSessionId) {
            const children = insertBefore ? [newNode, node] : [node, newNode]
            return { type: direction, children }
          }
          if (node.children) {
            return { ...node, children: node.children.map(insertSplit) }
          }
          return node
        }
        set({ workspaceLayout: insertSplit(state.workspaceLayout), activeSessionId: newSessionId, savedWorkspaceLayout: null })
      },

      removeSessionFromWorkspace: (sessionId) => {
        const state = get()
        if (!state.workspaceLayout) return

        const removeNode = (node) => {
          if (node.type === 'session') return node.sessionId === sessionId ? null : node
          const children = node.children.map(removeNode).filter(Boolean)
          if (children.length === 0) return null
          if (children.length === 1) return children[0]
          return { ...node, children }
        }
        const newLayout = removeNode(state.workspaceLayout)
        if (!newLayout || newLayout.type === 'session') {
          set({ workspaceLayout: null, activeSessionId: newLayout?.sessionId || state.activeSessionId })
        } else {
          set({ workspaceLayout: newLayout })
        }
      },

      updateLayoutSizes: (sessionId, path, sizes) =>
        set((s) => ({
          directories: s.directories.map((d) => ({
            ...d,
            sessions: d.sessions.map((ss) =>
              ss.id === sessionId
                ? { ...ss, layout: updateNodeSizes(ss.layout, path, sizes) }
                : ss
            ),
          })),
        })),

      updateWorkspaceSizes: (path, sizes) =>
        set((s) => ({
          workspaceLayout: s.workspaceLayout
            ? updateNodeSizes(s.workspaceLayout, path, sizes)
            : null,
        })),

      // Add session to workspace root level (push entire existing layout to one side)
      addSessionToWorkspaceRoot: (newSessionId, zone) => {
        const state = get()
        const direction = (zone === 'left' || zone === 'right') ? 'vsplit' : 'hsplit'
        const insertBefore = zone === 'left' || zone === 'top'
        const newNode = { type: 'session', sessionId: newSessionId }

        const isInLayout = (node, sid) => {
          if (!node) return false
          if (node.type === 'session') return node.sessionId === sid
          return node.children?.some(c => isInLayout(c, sid)) || false
        }
        if (state.workspaceLayout && isInLayout(state.workspaceLayout, newSessionId)) return

        let existingLayout = state.workspaceLayout
        if (!existingLayout) {
          if (!state.activeSessionId) return
          existingLayout = { type: 'session', sessionId: state.activeSessionId }
        }

        const children = insertBefore ? [newNode, existingLayout] : [existingLayout, newNode]
        set({ workspaceLayout: { type: direction, children }, activeSessionId: newSessionId, savedWorkspaceLayout: null })
      },
    }),
    {
      name: 'grove',
      // Feature 8: Save sessions (auto restore)
      partialize: (s) => ({
        directories: s.directories.map((d) => ({
          ...d,
          sessions: d.sessions.map(({ id, name, cwd, layout, activePaneId }) => ({
            id, name, cwd,
            layout: layout || { type: 'pane', id, cwd },
            activePaneId: activePaneId || id,
          })),
        })),
        activeSessionId: s.activeSessionId,
        settings: s.settings,
        workspaceLayout: s.workspaceLayout || null,
        savedWorkspaceLayout: s.savedWorkspaceLayout || null,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const validIds = new Set(
          state.directories.flatMap((d) => d.sessions.map((s) => s.id))
        )
        const validateLayout = (node) => {
          if (!node) return null
          if (node.type === 'session') return validIds.has(node.sessionId) ? node : null
          const children = node.children.map(validateLayout).filter(Boolean)
          if (children.length === 0) return null
          if (children.length === 1) return children[0]
          return { ...node, children }
        }
        let wl = validateLayout(state.workspaceLayout)
        if (wl?.type === 'session') wl = null
        let swl = validateLayout(state.savedWorkspaceLayout)
        if (swl?.type === 'session') swl = null
        if (wl !== state.workspaceLayout || swl !== state.savedWorkspaceLayout) {
          useStore.setState({ workspaceLayout: wl, savedWorkspaceLayout: swl })
        }
      },
    }
  )
)

export default useStore
