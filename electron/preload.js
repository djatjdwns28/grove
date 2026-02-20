const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  pty: {
    create: (params) => ipcRenderer.invoke('pty:create', params),
    write: (id, data) => ipcRenderer.send('pty:write', { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', { id, cols, rows }),
    kill: (id) => ipcRenderer.send('pty:kill', { id }),
    onData: (id, cb) => {
      const handler = (_, data) => cb(data)
      ipcRenderer.on(`pty:data:${id}`, handler)
      return () => ipcRenderer.removeListener(`pty:data:${id}`, handler)
    },
    onExit: (id, cb) => {
      const handler = () => cb()
      ipcRenderer.once(`pty:exit:${id}`, handler)
      return () => ipcRenderer.removeListener(`pty:exit:${id}`, handler)
    },
  },
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  getGitBranches: (dirPath) => ipcRenderer.invoke('git:branches', dirPath),
  getGitWorktrees: (dirPath) => ipcRenderer.invoke('git:worktrees', dirPath),
  getAllBranches: (dirPath) => ipcRenderer.invoke('git:all-branches', dirPath),
  addGitWorktree: (params) => ipcRenderer.invoke('git:add-worktree', params),
  removeGitWorktree: (params) => ipcRenderer.invoke('git:remove-worktree', params),
  getGitStatus: (dirPath) => ipcRenderer.invoke('git:status', dirPath),
  showNotification: (title, body) => ipcRenderer.invoke('notification:show', { title, body }),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openInEditor: (params) => ipcRenderer.invoke('editor:open', params),
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
})
