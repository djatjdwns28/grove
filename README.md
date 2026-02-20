# Grove

**[English](README.md)** | **[한국어](README_ko.md)**

A terminal manager built for git worktree workflows. Run multiple terminals across different worktrees side by side.

## Features

- **Worktree Management** — Add directories, create worktrees from branches, and manage them from the sidebar
- **Multi-Session Terminals** — Open multiple terminal sessions per directory with tab-like navigation
- **Split Panes** — Split terminals vertically or horizontally within a session
- **Workspace Split** — Drag sessions to view multiple sessions side by side
- **Broadcast Mode** — Type once, send to all terminals simultaneously
- **Git Status** — See branch name, changed files, ahead/behind indicators at a glance
- **Terminal Search** — Find text in terminal output with `Cmd+F`
- **Command Palette** — Quick access to all actions with `Cmd+P`
- **Clickable File Paths** — Click `file:line:col` patterns to open in VS Code
- **Clickable URLs** — Click URLs in terminal output to open in browser
- **Session Clone** — Duplicate any session with one click
- **Drag & Drop Reorder** — Rearrange sessions and directories by dragging
- **Snippets** — Save and run frequently used commands
- **Customizable** — Fonts, themes (Catppuccin, Dracula, Nord, etc.), and more
- **Session Restore** — Sessions persist across app restarts
- **Auto Updates** — Get notified when a new version is available

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+P` | Command Palette |
| `Cmd+T` | Recently closed sessions |
| `Cmd+W` | Close current session |
| `Cmd+F` | Search in terminal |
| `Cmd+1-9` | Switch to nth session |

## Download

| OS | Architecture | Download |
|----|-------------|----------|
| macOS | Apple Silicon (M1/M2/M3/M4) | [Grove-0.1.7-arm64.dmg](https://github.com/djatjdwns28/grove/releases/download/v0.1.7/Grove-0.1.7-arm64.dmg) |
| macOS | Intel | [Grove-0.1.7.dmg](https://github.com/djatjdwns28/grove/releases/download/v0.1.7/Grove-0.1.7.dmg) |
| Windows | x64 | [Grove-Setup-0.1.7.exe](https://github.com/djatjdwns28/grove/releases/download/v0.1.7/Grove-Setup-0.1.7.exe) |
| Linux | x64 | [Grove-0.1.7.AppImage](https://github.com/djatjdwns28/grove/releases/download/v0.1.7/Grove-0.1.7.AppImage) |

Or browse all files on the [Releases](https://github.com/djatjdwns28/grove/releases/latest) page.

### macOS — "Apple cannot check for malicious software" warning

Since the app is not signed with an Apple Developer certificate, macOS will show a warning on first launch. To open it:

1. Try opening the app (the warning will appear)
2. Go to **Apple menu → System Settings → Privacy & Security**
3. Scroll down to the **Security** section
4. Click **Open Anyway** (available for about 1 hour after the warning)
5. Click **Open**
6. Enter your login password and click **OK**

You only need to do this once. After that, the app will open normally.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for distribution
npm run dist
```

### Requirements

- Node.js 18+
- macOS / Windows / Linux

## Tech Stack

- [Electron](https://www.electronjs.org/) — Desktop framework
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) — UI
- [xterm.js](https://xtermjs.org/) — Terminal emulator
- [node-pty](https://github.com/nicedoc/node-pty) — Pseudo-terminal
- [Zustand](https://github.com/pmndrs/zustand) — State management

## License

[MIT](LICENSE) - Copyright (c) 2026 djatjdwns28
