import React, { useRef, useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import useStore from '../store'
import { themeList, getThemeColors, getDefaultCustomColors } from '../themes'

const colorFields = [
  { key: 'background', label: 'Background' },
  { key: 'foreground', label: 'Foreground' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'selectionBackground', label: 'Selection' },
  { key: 'black', label: 'Black' },
  { key: 'red', label: 'Red' },
  { key: 'green', label: 'Green' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'blue', label: 'Blue' },
  { key: 'magenta', label: 'Magenta' },
  { key: 'cyan', label: 'Cyan' },
  { key: 'white', label: 'White' },
  { key: 'brightBlack', label: 'Bright Black' },
  { key: 'brightRed', label: 'Bright Red' },
  { key: 'brightGreen', label: 'Bright Green' },
  { key: 'brightYellow', label: 'Bright Yellow' },
  { key: 'brightBlue', label: 'Bright Blue' },
  { key: 'brightMagenta', label: 'Bright Magenta' },
  { key: 'brightCyan', label: 'Bright Cyan' },
  { key: 'brightWhite', label: 'Bright White' },
]

const tabs = [
  { key: 'terminal', label: 'Terminal' },
  { key: 'theme', label: 'Theme' },
  { key: 'snippets', label: 'Snippets' },
]

function SettingsModal({ onClose }) {
  const { settings, updateSettings, resetSettings } = useStore()
  const overlayRef = useRef(null)
  const previewRef = useRef(null)
  const [activeTab, setActiveTab] = useState('terminal')

  const themeColors = getThemeColors(settings.themeName, settings.customColors)

  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    el.style.background = themeColors.background
    el.style.color = themeColors.foreground
  }, [themeColors])

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose()
  }

  const handleThemeChange = (themeName) => {
    if (themeName === 'custom') {
      const base = settings.customColors || getDefaultCustomColors()
      updateSettings({ themeName: 'custom', customColors: base })
    } else {
      updateSettings({ themeName })
    }
  }

  const handleColorChange = (key, value) => {
    const current = settings.customColors || getDefaultCustomColors()
    updateSettings({ customColors: { ...current, [key]: value } })
  }

  const showPreview = activeTab === 'terminal' || activeTab === 'theme'

  return (
    <div className="settings-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="settings-modal">
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div className="settings-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`settings-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="settings-body">
          <div className="settings-columns">
            {/* Left: Settings controls */}
            <div className="settings-left">

              {/* Terminal tab */}
              {activeTab === 'terminal' && (
                <div className="settings-section">
                  <label className="settings-label">Font</label>
                  <input
                    className="settings-input"
                    value={settings.fontFamily}
                    onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                  />

                  <label className="settings-label">Font Size — {settings.fontSize}px</label>
                  <input
                    type="range"
                    className="settings-slider"
                    min={10}
                    max={24}
                    step={1}
                    value={settings.fontSize}
                    onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
                  />

                  <label className="settings-label">Line Height — {settings.lineHeight}</label>
                  <input
                    type="range"
                    className="settings-slider"
                    min={1.0}
                    max={2.0}
                    step={0.1}
                    value={settings.lineHeight}
                    onChange={(e) => updateSettings({ lineHeight: Number(e.target.value) })}
                  />

                  <div className="settings-row">
                    <label className="settings-label" style={{ flex: 1, marginBottom: 0 }}>Cursor Blink</label>
                    <button
                      className={`settings-toggle ${settings.cursorBlink ? 'on' : ''}`}
                      onClick={() => updateSettings({ cursorBlink: !settings.cursorBlink })}
                    >
                      <span className="settings-toggle-knob" />
                    </button>
                  </div>

                  <label className="settings-label">Scrollback</label>
                  <input
                    type="number"
                    className="settings-input settings-input-narrow"
                    min={500}
                    max={50000}
                    step={500}
                    value={settings.scrollback}
                    onChange={(e) => updateSettings({ scrollback: Number(e.target.value) })}
                  />

                  <div className="settings-row">
                    <label className="settings-label" style={{ flex: 1, marginBottom: 0 }}>Notify on Command Complete</label>
                    <button
                      className={`settings-toggle ${settings.notifyOnComplete !== false ? 'on' : ''}`}
                      onClick={() => updateSettings({ notifyOnComplete: !settings.notifyOnComplete })}
                    >
                      <span className="settings-toggle-knob" />
                    </button>
                  </div>
                  <span className="settings-hint">Send notification when a long-running command finishes in an inactive session</span>

                  <label className="settings-label" style={{ marginTop: 12 }}>Shell</label>
                  <input
                    className="settings-input"
                    placeholder="System default (e.g. /bin/zsh, /bin/bash)"
                    value={settings.defaultShell || ''}
                    onChange={(e) => updateSettings({ defaultShell: e.target.value })}
                  />
                  <span className="settings-hint">Leave empty to use system default. New sessions will use this shell.</span>
                </div>
              )}

              {/* Theme tab */}
              {activeTab === 'theme' && (
                <>
                  <div className="settings-section">
                    <div className="theme-list">
                      {themeList.map((t) => (
                        <label key={t.key} className="theme-option">
                          <input
                            type="radio"
                            name="theme"
                            checked={settings.themeName === t.key}
                            onChange={() => handleThemeChange(t.key)}
                          />
                          <span className="theme-name">{t.label}</span>
                          <span
                            className="theme-swatch"
                            style={{ background: getThemeColors(t.key, null).background }}
                          >
                            <span style={{ color: getThemeColors(t.key, null).foreground }}>Aa</span>
                          </span>
                        </label>
                      ))}
                      <label className="theme-option">
                        <input
                          type="radio"
                          name="theme"
                          checked={settings.themeName === 'custom'}
                          onChange={() => handleThemeChange('custom')}
                        />
                        <span className="theme-name">Custom</span>
                      </label>
                    </div>
                  </div>

                  {settings.themeName === 'custom' && (
                    <div className="settings-section">
                      <div className="settings-section-title">Custom Colors</div>
                      <div className="color-grid">
                        {colorFields.map((f) => (
                          <div key={f.key} className="color-field">
                            <input
                              type="color"
                              value={(settings.customColors || {})[f.key] || '#000000'}
                              onChange={(e) => handleColorChange(f.key, e.target.value)}
                            />
                            <span className="color-label">{f.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Snippets tab */}
              {activeTab === 'snippets' && (
                <div className="settings-section">
                  <div className="snippet-list">
                    {(settings.snippets || []).map((snippet) => (
                      <div key={snippet.id} className="snippet-item">
                        <input
                          className="settings-input snippet-label-input"
                          placeholder="Name"
                          value={snippet.label}
                          onChange={(e) => {
                            const updated = settings.snippets.map((s) =>
                              s.id === snippet.id ? { ...s, label: e.target.value } : s
                            )
                            updateSettings({ snippets: updated })
                          }}
                        />
                        <input
                          className="settings-input snippet-cmd-input"
                          placeholder="Command"
                          value={snippet.command}
                          onChange={(e) => {
                            const updated = settings.snippets.map((s) =>
                              s.id === snippet.id ? { ...s, command: e.target.value } : s
                            )
                            updateSettings({ snippets: updated })
                          }}
                        />
                        <button
                          className="icon-btn danger"
                          onClick={() => {
                            updateSettings({ snippets: settings.snippets.filter((s) => s.id !== snippet.id) })
                          }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="snippet-add-btn"
                    onClick={() => {
                      const snippets = [...(settings.snippets || []), { id: uuidv4(), label: '', command: '' }]
                      updateSettings({ snippets })
                    }}
                  >+ Add Snippet</button>
                  {(settings.snippets || []).length === 0 && (
                    <div className="settings-empty-hint">No snippets registered</div>
                  )}
                </div>
              )}

            </div>

            {/* Right: Preview (only in terminal/theme tabs) */}
            {showPreview && (
              <div className="settings-right">
                <div className="settings-section-title">Preview</div>
                <div
                  className="settings-preview"
                  ref={previewRef}
                  style={{
                    background: themeColors.background,
                    color: themeColors.foreground,
                    fontFamily: settings.fontFamily,
                    fontSize: settings.fontSize,
                    lineHeight: settings.lineHeight,
                  }}
                >
                  <span style={{ color: themeColors.green }}>user@mac</span>
                  <span style={{ color: themeColors.white }}>:</span>
                  <span style={{ color: themeColors.blue }}>~/project</span>
                  <span style={{ color: themeColors.white }}>$ </span>
                  <span>ls -la</span>
                  {'\n'}
                  <span style={{ color: themeColors.blue }}>drwxr-xr-x</span>
                  {'  '}
                  <span>README.md</span>
                  {'  '}
                  <span style={{ color: themeColors.green }}>src/</span>
                  {'  '}
                  <span style={{ color: themeColors.yellow }}>package.json</span>
                  {'\n'}
                  <span style={{ color: themeColors.red }}>error:</span>
                  {' something went wrong'}
                  {'\n'}
                  <span style={{ color: themeColors.cyan }}>info:</span>
                  {' '}
                  <span style={{ color: themeColors.magenta }}>Done</span>
                  {' in 1.23s'}
                  {'\n'}
                  <span style={{ color: themeColors.yellow }}>warning:</span>
                  {' deprecated API usage'}
                  {'\n\n'}
                  <span style={{ color: themeColors.green }}>user@mac</span>
                  <span style={{ color: themeColors.white }}>:</span>
                  <span style={{ color: themeColors.blue }}>~/project</span>
                  <span style={{ color: themeColors.white }}>$ </span>
                  <span style={{ color: themeColors.cursor }}>_</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-footer">
          <button className="settings-btn reset" onClick={() => resetSettings()}>Reset</button>
          <button className="settings-btn close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
