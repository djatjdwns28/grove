const themes = {
  'catppuccin-mocha': {
    label: 'Catppuccin Mocha',
    colors: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: '#45475a',
      black: '#45475a', brightBlack: '#585b70',
      red: '#f38ba8', brightRed: '#f38ba8',
      green: '#a6e3a1', brightGreen: '#a6e3a1',
      yellow: '#f9e2af', brightYellow: '#f9e2af',
      blue: '#89b4fa', brightBlue: '#89b4fa',
      magenta: '#f5c2e7', brightMagenta: '#f5c2e7',
      cyan: '#94e2d5', brightCyan: '#94e2d5',
      white: '#bac2de', brightWhite: '#a6adc8',
    },
  },
  'catppuccin-latte': {
    label: 'Catppuccin Latte',
    colors: {
      background: '#eff1f5',
      foreground: '#4c4f69',
      cursor: '#dc8a78',
      selectionBackground: '#acb0be',
      black: '#5c5f77', brightBlack: '#6c6f85',
      red: '#d20f39', brightRed: '#d20f39',
      green: '#40a02b', brightGreen: '#40a02b',
      yellow: '#df8e1d', brightYellow: '#df8e1d',
      blue: '#1e66f5', brightBlue: '#1e66f5',
      magenta: '#ea76cb', brightMagenta: '#ea76cb',
      cyan: '#179299', brightCyan: '#179299',
      white: '#acb0be', brightWhite: '#bcc0cc',
    },
  },
  dracula: {
    label: 'Dracula',
    colors: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selectionBackground: '#44475a',
      black: '#21222c', brightBlack: '#6272a4',
      red: '#ff5555', brightRed: '#ff6e6e',
      green: '#50fa7b', brightGreen: '#69ff94',
      yellow: '#f1fa8c', brightYellow: '#ffffa5',
      blue: '#bd93f9', brightBlue: '#d6acff',
      magenta: '#ff79c6', brightMagenta: '#ff92df',
      cyan: '#8be9fd', brightCyan: '#a4ffff',
      white: '#f8f8f2', brightWhite: '#ffffff',
    },
  },
  'one-dark': {
    label: 'One Dark',
    colors: {
      background: '#282c34',
      foreground: '#abb2bf',
      cursor: '#528bff',
      selectionBackground: '#3e4451',
      black: '#545862', brightBlack: '#636b78',
      red: '#e06c75', brightRed: '#e06c75',
      green: '#98c379', brightGreen: '#98c379',
      yellow: '#e5c07b', brightYellow: '#e5c07b',
      blue: '#61afef', brightBlue: '#61afef',
      magenta: '#c678dd', brightMagenta: '#c678dd',
      cyan: '#56b6c2', brightCyan: '#56b6c2',
      white: '#abb2bf', brightWhite: '#c8ccd4',
    },
  },
  'solarized-dark': {
    label: 'Solarized Dark',
    colors: {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#93a1a1',
      selectionBackground: '#073642',
      black: '#073642', brightBlack: '#586e75',
      red: '#dc322f', brightRed: '#cb4b16',
      green: '#859900', brightGreen: '#586e75',
      yellow: '#b58900', brightYellow: '#657b83',
      blue: '#268bd2', brightBlue: '#839496',
      magenta: '#d33682', brightMagenta: '#6c71c4',
      cyan: '#2aa198', brightCyan: '#93a1a1',
      white: '#eee8d5', brightWhite: '#fdf6e3',
    },
  },
  'tokyo-night': {
    label: 'Tokyo Night',
    colors: {
      background: '#1a1b26',
      foreground: '#a9b1d6',
      cursor: '#c0caf5',
      selectionBackground: '#33467c',
      black: '#32344a', brightBlack: '#444b6a',
      red: '#f7768e', brightRed: '#ff7a93',
      green: '#9ece6a', brightGreen: '#b9f27c',
      yellow: '#e0af68', brightYellow: '#ff9e64',
      blue: '#7aa2f7', brightBlue: '#7da6ff',
      magenta: '#ad8ee6', brightMagenta: '#bb9af7',
      cyan: '#449dab', brightCyan: '#0db9d7',
      white: '#787c99', brightWhite: '#acb0d0',
    },
  },
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`
}

function mixHex(a, b, t) {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16)
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16)
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bv = Math.round(ab + (bb - ab) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`
}

export function getUIVariables(themeName, customColors) {
  const tc = getThemeColors(themeName, customColors)
  const bg = tc.background
  const sel = tc.selectionBackground || tc.black
  const lum = (parseInt(bg.slice(1, 3), 16) + parseInt(bg.slice(3, 5), 16) + parseInt(bg.slice(5, 7), 16)) / 3
  const isDark = lum < 128

  return {
    '--bg-base': bg,
    '--bg-mantle': mixHex(bg, '#000000', isDark ? 0.2 : 0.04),
    '--bg-overlay': mixHex(bg, sel, 0.15),
    '--bg-surface': mixHex(bg, sel, 0.5),
    '--bg-hover': sel,
    '--text': tc.foreground,
    '--text-sub': tc.white,
    '--text-muted': tc.brightBlack,
    '--text-dim': mixHex(tc.brightBlack, tc.foreground, 0.2),
    '--accent': tc.blue,
    '--danger': tc.red,
    '--success': tc.green,
    '--warning': tc.yellow,
    '--accent-rgb': hexToRgb(tc.blue),
    '--danger-rgb': hexToRgb(tc.red),
    '--success-rgb': hexToRgb(tc.green),
    '--warning-rgb': hexToRgb(tc.yellow),
    '--text-rgb': hexToRgb(tc.foreground),
  }
}

export function getThemeColors(themeName, customColors) {
  if (themeName === 'custom' && customColors) return customColors
  return themes[themeName]?.colors || themes['catppuccin-mocha'].colors
}

export function getDefaultCustomColors() {
  return { ...themes['catppuccin-mocha'].colors }
}

export const themeList = Object.entries(themes).map(([key, val]) => ({
  key,
  label: val.label,
}))

export default themes
