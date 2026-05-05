# Live WPM Counting

A VSCode extension that displays your **real-time typing speed** directly in the status bar while you code. Track your words per minute (WPM) or characters per minute (CPM) with intelligent word detection that avoids inflating your score from autocomplete and paste operations.

---

## Features

### Real-Time WPM Display
Your current typing speed updates every second in the top-right status bar. It counts actual words typed — not characters divided by 5 — for accurate measurement.

### Intelligent Word Detection
The extension distinguishes between:
- **Normal typing** — counts words as you complete them
- **Autocomplete / snippets** — does not inflate your WPM for code the editor inserted for you
- **Multi-line pastes** — counts real words in the pasted text without spiking your score
- **Enter key / newlines** — treated as word boundaries

### Session Average WPM
Alongside your current speed, the extension tracks your session average:
- Calculated as total words typed ÷ active time span
- Idle periods are excluded from the time span
- Persists through inactivity until you manually reset

### Idle Detection & Auto-Reset
After a configurable period of inactivity (default: 5 seconds), the current WPM display resets to 0. Your session stats (total words, average WPM) are preserved.

### Visual Speed Indicators
The status bar icon and color change based on your typing speed:

| Speed | Icon | Color |
|-------|------|-------|
| 80+ WPM | ⚡ | Orange |
| 50–79 WPM | 🚀 | Yellow |
| 20–49 WPM | ⌨️ | Default |
| Under 20 WPM | ✏️ | Gray |

### CPM Mode
Prefer characters per minute? Toggle CPM display in settings. The extension still uses WPM thresholds internally for icon and color selection (CPM ÷ 5).

---

## Commands

| Command | Description |
|---------|-------------|
| `Typing Speed Meter: Reset` | Resets current WPM, session word count, and session average |
| `Typing Speed Meter: Toggle Visibility` | Shows or hides the WPM display in the status bar |

> You can also **click the status bar item** to reset all statistics instantly.

---

## Settings

All settings are under the `typingSpeedMeter` namespace in your VSCode settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `typingSpeedMeter.windowSeconds` | number | `10` | Sliding window duration (3–60 s) used to calculate current WPM |
| `typingSpeedMeter.idleResetSeconds` | number | `5` | Seconds of inactivity before current WPM resets to 0 (1–30 s) |
| `typingSpeedMeter.showCharactersPerMinute` | boolean | `false` | Display CPM instead of WPM |

### Example `settings.json`
```json
{
  "typingSpeedMeter.windowSeconds": 15,
  "typingSpeedMeter.idleResetSeconds": 10,
  "typingSpeedMeter.showCharactersPerMinute": false
}
```

---

## How It Works

The extension uses a **sliding window** approach:

1. Every text insertion is timestamped.
2. Word completions (space, punctuation, newline) are recorded separately.
3. Each second, the extension counts words typed within the last `windowSeconds` seconds to compute current WPM.
4. Session average is computed from the first word typed until the most recent, excluding idle gaps.

This means your WPM reflects what you *actually typed*, not what the editor inserted for you.

---

## Installation

### From the VSIX Package
1. Download `typing-speed-meter-1.0.0.vsix`.
2. Open VSCode and go to **Extensions** (`Ctrl+Shift+X`).
3. Click the `...` menu (top-right of the Extensions panel) → **Install from VSIX…**
4. Select the downloaded `.vsix` file.
5. Reload VSCode if prompted.

### From the Marketplace
Search for **"Live WPM counting"** by **SwiftkeyC** in the Extensions Marketplace.

---

## Development

### Prerequisites
- Node.js
- npm
- VSCode 1.85.0+

### Setup
```bash
npm install
```

### Build
```bash
npm run compile
```

### Watch Mode (auto-recompile on change)
```bash
npm run watch
```

### Debug
Press `F5` in VSCode to launch the Extension Development Host with the extension loaded.

---

## Requirements

- VSCode **1.85.0** or later

---

## Known Limitations

- WPM is measured only in the **active editor**. Switching tabs does not transfer the current window but session stats persist.
- Autocomplete accepted via `Tab` or `Enter` is intentionally excluded from the word count to keep scores meaningful.

---

## Publisher

**SwiftkeyC** — [View on Marketplace](https://marketplace.visualstudio.com/publishers/SwiftkeyC)

---

## License

See [LICENSE](LICENSE) for details.
