const { app, BrowserWindow, ipcMain, dialog, Notification, shell, Menu } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

const pty = require('node-pty')
const { autoUpdater } = require('electron-updater')

const isDev = !app.isPackaged
const ptySessions = new Map()

let mainWindow

// --- Window bounds persistence ---
function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(getWindowStatePath(), 'utf8'))
  } catch {
    return null
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return
  const bounds = win.getBounds()
  const isMaximized = win.isMaximized()
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify({ bounds, isMaximized }))
  } catch {}
}

function createWindow() {
  const saved = loadWindowState()
  const defaults = { width: 1280, height: 800 }

  let bounds = defaults
  if (saved?.bounds) {
    const { screen } = require('electron')
    const displays = screen.getAllDisplays()
    const visible = displays.some((d) => {
      const b = saved.bounds
      return (
        b.x < d.bounds.x + d.bounds.width &&
        b.x + b.width > d.bounds.x &&
        b.y < d.bounds.y + d.bounds.height &&
        b.y + b.height > d.bounds.y
      )
    })
    if (visible) bounds = saved.bounds
  }

  mainWindow = new BrowserWindow({
    ...bounds,
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

  if (saved?.isMaximized) mainWindow.maximize()

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  // Save window bounds on move/resize (debounced)
  let boundsTimer = null
  const debouncedBoundsSave = () => {
    clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => saveWindowState(mainWindow), 500)
  }
  mainWindow.on('resize', debouncedBoundsSave)
  mainWindow.on('move', debouncedBoundsSave)
  mainWindow.on('close', () => saveWindowState(mainWindow))

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
  ipcMain.handle('pty:create', (event, { id, cwd, shell: customShell }) => {
    if (ptySessions.has(id)) return { success: true }

    try {
      const shell = customShell || process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh')

      const ptyProcess = pty.spawn(shell, ['--login'], {
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
    } catch (e) {
      return { success: false, error: e.message }
    }
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

  // PTY get current working directory (fallback for shells without OSC 7)
  ipcMain.handle('pty:get-cwd', async (event, { id }) => {
    const ptyProcess = ptySessions.get(id)
    if (!ptyProcess) return { success: false }
    try {
      const pid = ptyProcess.pid
      if (process.platform === 'darwin') {
        const { stdout } = await execAsync(`lsof -a -d cwd -p ${pid} -Fn`, { encoding: 'utf8', timeout: 2000 })
        const cwdLine = stdout.split('\n').find((l) => l.startsWith('n/'))
        if (cwdLine) return { success: true, cwd: cwdLine.slice(1) }
      } else if (process.platform === 'linux') {
        const cwd = await fs.promises.readlink(`/proc/${pid}/cwd`)
        return { success: true, cwd }
      }
      return { success: false }
    } catch {
      return { success: false }
    }
  })

  // Directory selection dialog
  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Helper: parse local + cached remote branches (no network)
  const parseBranches = async (dirPath) => {
    const { stdout: localOutput } = await execAsync('git branch', { cwd: dirPath, encoding: 'utf8' })
    const localBranches = localOutput.split('\n')
      .map((b) => ({
        name: b.replace(/^[\s*+]+/, '').trim(),
        current: b.trim().startsWith('*'),
        remote: false,
      }))
      .filter((b) => b.name)

    const { stdout: remoteOutput } = await execAsync('git branch -r', { cwd: dirPath, encoding: 'utf8' })
    const localNames = new Set(localBranches.map((b) => b.name))
    const remoteBranches = remoteOutput.split('\n')
      .map((b) => b.trim())
      .filter((b) => b && !b.includes('->'))  // Exclude HEAD -> origin/main
      .map((b) => b.replace(/^origin\//, ''))
      .filter((name) => !localNames.has(name))
      .map((name) => ({ name, current: false, remote: true }))

    return [...localBranches, ...remoteBranches]
  }

  // Fast branch listing — reads cached refs only, no network fetch
  ipcMain.handle('git:all-branches-cached', async (event, dirPath) => {
    try {
      const branches = await parseBranches(dirPath)
      return { branches, isGit: true }
    } catch {
      return { branches: [], isGit: false }
    }
  })

  // Background fetch — fire and forget, updates cached refs for next listing
  ipcMain.handle('git:fetch-background', async (event, dirPath) => {
    try { await execAsync('git fetch --prune', { cwd: dirPath, encoding: 'utf8', timeout: 15000 }) } catch {}
    return { success: true }
  })

  // Get all branches (local + remote) — with network fetch (legacy, used by CommandPalette)
  ipcMain.handle('git:all-branches', async (event, dirPath) => {
    try {
      try { await execAsync('git fetch --prune', { cwd: dirPath, encoding: 'utf8', timeout: 15000 }) } catch {}
      const branches = await parseBranches(dirPath)
      return { branches, isGit: true }
    } catch {
      return { branches: [], isGit: false }
    }
  })

  // Create new worktree
  ipcMain.handle('git:add-worktree', async (event, { repoPath, branch }) => {
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

      await execAsync(`git worktree add "${worktreePath}" "${branch}"`, {
        cwd: repoPath,
        encoding: 'utf8',
      })
      return { success: true, path: worktreePath }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // Remove worktree
  ipcMain.handle('git:remove-worktree', async (event, { repoPath, worktreePath }) => {
    try {
      await execAsync(`git worktree remove "${worktreePath}" --force`, {
        cwd: repoPath,
        encoding: 'utf8',
      })
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // Git status query (Feature 3)
  ipcMain.handle('git:status', async (event, dirPath) => {
    try {
      const { stdout } = await execAsync('git status --porcelain --branch', {
        cwd: dirPath, encoding: 'utf8', timeout: 5000,
      })
      const lines = stdout.trim().split('\n')
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

  // Terminal context menu (right-click)
  ipcMain.handle('context-menu:show', (event, { hasSelection }) => {
    return new Promise((resolve) => {
      const template = [
        { label: 'Copy', enabled: hasSelection, click: () => resolve('copy') },
        { label: 'Paste', click: () => resolve('paste') },
        { type: 'separator' },
        { label: 'Clear', click: () => resolve('clear') },
        { type: 'separator' },
        { label: 'Split Vertical', click: () => resolve('vsplit') },
        { label: 'Split Horizontal', click: () => resolve('hsplit') },
      ]
      const menu = Menu.buildFromTemplate(template)
      menu.popup({ window: mainWindow })
      menu.once('menu-will-close', () => setTimeout(() => resolve(null), 100))
    })
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
  ipcMain.handle('git:branches', async (event, dirPath) => {
    try {
      const { stdout: branchOutput } = await execAsync('git branch', { cwd: dirPath, encoding: 'utf8' })
      const branches = branchOutput
        .split('\n')
        .map(b => b.replace('*', '').trim())
        .filter(Boolean)

      const { stdout: currentOutput } = await execAsync('git branch --show-current', {
        cwd: dirPath,
        encoding: 'utf8',
      })

      return { branches, current: currentOutput.trim(), isGit: true }
    } catch {
      return { branches: [], current: null, isGit: false }
    }
  })

  // Get Git worktree list
  ipcMain.handle('git:worktrees', async (event, dirPath) => {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', { cwd: dirPath, encoding: 'utf8' })
      const worktrees = []
      // Each worktree block is separated by blank lines
      for (const block of stdout.trim().split(/\n\n+/)) {
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

  // --- Scrollback persistence ---
  const scrollbackDir = path.join(app.getPath('userData'), 'scrollback')

  ipcMain.handle('scrollback:save', async (event, { id, data }) => {
    try {
      await fs.promises.mkdir(scrollbackDir, { recursive: true })
      await fs.promises.writeFile(path.join(scrollbackDir, `${id}.txt`), data, 'utf8')
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('scrollback:load', async (event, { id }) => {
    try {
      const data = await fs.promises.readFile(path.join(scrollbackDir, `${id}.txt`), 'utf8')
      return { success: true, data }
    } catch {
      return { success: true, data: '' }
    }
  })

  ipcMain.handle('scrollback:delete', async (event, { id }) => {
    try { await fs.promises.unlink(path.join(scrollbackDir, `${id}.txt`)) } catch {}
    return { success: true }
  })

  // Quit-ready signal from renderer after scrollback save
  ipcMain.on('app:quit-ready', () => {
    app.quit()
  })
})

// Graceful quit: let renderer save scrollback before exit
let isQuitting = false
app.on('before-quit', (e) => {
  if (!isQuitting) {
    isQuitting = true
    e.preventDefault()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:before-quit')
      setTimeout(() => app.quit(), 3000)
    } else {
      app.quit()
    }
  }
})

app.on('window-all-closed', () => {
  ptySessions.forEach((p) => { try { p.kill() } catch (e) {} })
  if (process.platform !== 'darwin') app.quit()
})
