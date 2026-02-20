const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { execSync, exec } = require('child_process')

const pty = require('node-pty')
const { autoUpdater } = require('electron-updater')

const isDev = !app.isPackaged
const ptySessions = new Map()

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 700,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  // Auto update check (production only)
  if (!isDev) {
    autoUpdater.autoDownload = false
    autoUpdater.checkForUpdates().catch(() => {})

    autoUpdater.on('error', () => {})

    autoUpdater.on('update-available', (info) => {
      let notes = ''
      if (typeof info.releaseNotes === 'string') {
        notes = info.releaseNotes
      } else if (Array.isArray(info.releaseNotes)) {
        notes = info.releaseNotes.map((n) => n.note || '').join('\n')
      }
      mainWindow.webContents.send('update:available', { version: info.version, releaseNotes: notes })
    })
  }

  // PTY creation
  ipcMain.handle('pty:create', (event, { id, cwd }) => {
    if (ptySessions.has(id)) return { success: true }

    const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh')

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color', CLAUDECODE: '' },
    })

    ptyProcess.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:data:${id}`, data)
      }
    })

    ptyProcess.onExit(() => {
      ptySessions.delete(id)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`pty:exit:${id}`)
      }
    })

    ptySessions.set(id, ptyProcess)
    return { success: true }
  })

  // PTY input
  ipcMain.on('pty:write', (event, { id, data }) => {
    const ptyProcess = ptySessions.get(id)
    if (ptyProcess) ptyProcess.write(data)
  })

  // PTY resize
  ipcMain.on('pty:resize', (event, { id, cols, rows }) => {
    const ptyProcess = ptySessions.get(id)
    if (ptyProcess) ptyProcess.resize(cols, rows)
  })

  // PTY kill
  ipcMain.on('pty:kill', (event, { id }) => {
    const ptyProcess = ptySessions.get(id)
    if (ptyProcess) {
      try { ptyProcess.kill() } catch (e) {}
      ptySessions.delete(id)
    }
  })

  // Directory selection dialog
  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Get all local branches
  ipcMain.handle('git:all-branches', (event, dirPath) => {
    try {
      const output = execSync('git branch', { cwd: dirPath, encoding: 'utf8' })
      const branches = output.split('\n')
        .map((b) => ({
          name: b.replace(/^[\s*+]+/, '').trim(),  // Remove both * and + (+ = checked out in another worktree)
          current: b.trim().startsWith('*'),
        }))
        .filter((b) => b.name)
      return { branches, isGit: true }
    } catch {
      return { branches: [], isGit: false }
    }
  })

  // Create new worktree
  ipcMain.handle('git:add-worktree', (event, { repoPath, branch }) => {
    try {
      const repoName = path.basename(repoPath)
      const safeBranch = branch.replace(/\//g, '-').replace(/[^a-zA-Z0-9-_.]/g, '')
      const parentDir = path.dirname(repoPath)
      let worktreePath = path.join(parentDir, `${repoName}-${safeBranch}`)

      // Numeric suffix on path conflict
      let i = 2
      while (fs.existsSync(worktreePath)) {
        worktreePath = path.join(parentDir, `${repoName}-${safeBranch}-${i++}`)
      }

      execSync(`git worktree add "${worktreePath}" "${branch}"`, {
        cwd: repoPath,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      return { success: true, path: worktreePath }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // Remove worktree
  ipcMain.handle('git:remove-worktree', (event, { repoPath, worktreePath }) => {
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: repoPath,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // Git status query (Feature 3)
  ipcMain.handle('git:status', (event, dirPath) => {
    try {
      const output = execSync('git status --porcelain --branch', {
        cwd: dirPath, encoding: 'utf8', stdio: 'pipe',
      })
      const lines = output.trim().split('\n')
      const branchLine = lines[0] || ''
      let branch = '', ahead = 0, behind = 0
      const branchMatch = branchLine.match(/^## (.+?)(?:\.\.\.(.+?))?(?:\s|$)/)
      if (branchMatch) branch = branchMatch[1]
      const abMatch = branchLine.match(/\[ahead (\d+)(?:, behind (\d+))?\]|\[behind (\d+)\]/)
      if (abMatch) {
        ahead = parseInt(abMatch[1] || '0', 10)
        behind = parseInt(abMatch[2] || abMatch[3] || '0', 10)
      }
      const changed = lines.slice(1).filter((l) => l.trim()).length
      return { branch, ahead, behind, changed }
    } catch {
      return null
    }
  })

  // Show notification (Feature 4)
  ipcMain.handle('notification:show', (event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
    return { success: true }
  })

  // Open URL (external browser)
  ipcMain.handle('shell:open-external', (event, url) => {
    shell.openExternal(url)
    return { success: true }
  })

  // System info (for status bar)
  ipcMain.handle('system:info', () => {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    return {
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      totalMem,
      freeMem,
      usedMemPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      cpuCount: os.cpus().length,
      shell: process.env.SHELL || 'unknown',
    }
  })

  // Open file in editor (file:line:col)
  ipcMain.handle('editor:open', (event, { filePath: fp, line, col, cwd }) => {
    const resolved = path.isAbsolute(fp) ? fp : path.resolve(cwd || os.homedir(), fp)
    if (!fs.existsSync(resolved)) return { success: false, error: 'File not found' }
    exec(`code --goto "${resolved}:${line || 1}:${col || 1}"`, (err) => {
      if (err) shell.openPath(resolved)
    })
    return { success: true }
  })

  // Get Git branches
  ipcMain.handle('git:branches', (event, dirPath) => {
    try {
      const branchOutput = execSync('git branch', { cwd: dirPath, encoding: 'utf8' })
      const branches = branchOutput
        .split('\n')
        .map(b => b.replace('*', '').trim())
        .filter(Boolean)

      const current = execSync('git branch --show-current', {
        cwd: dirPath,
        encoding: 'utf8',
      }).trim()

      return { branches, current, isGit: true }
    } catch {
      return { branches: [], current: null, isGit: false }
    }
  })

  // Get Git worktree list
  ipcMain.handle('git:worktrees', (event, dirPath) => {
    try {
      const output = execSync('git worktree list --porcelain', { cwd: dirPath, encoding: 'utf8' })
      const worktrees = []
      // Each worktree block is separated by blank lines
      for (const block of output.trim().split(/\n\n+/)) {
        const wt = {}
        for (const line of block.trim().split('\n')) {
          if (line.startsWith('worktree ')) wt.path = line.slice(9)
          else if (line.startsWith('HEAD ')) wt.head = line.slice(5)
          else if (line.startsWith('branch ')) wt.branch = line.slice(7).replace('refs/heads/', '')
          else if (line === 'bare') wt.bare = true
          else if (line === 'detached') wt.branch = '(detached)'
        }
        if (wt.path && !wt.bare) worktrees.push(wt)
      }
      return { worktrees, isGit: true }
    } catch {
      return { worktrees: [], isGit: false }
    }
  })
})

app.on('window-all-closed', () => {
  ptySessions.forEach((p) => { try { p.kill() } catch (e) {} })
  if (process.platform !== 'darwin') app.quit()
})
