"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const WORD_RE = /\w+/g;
class TypingSpeedMeter {
    constructor() {
        // CPM: char timestamps in sliding window
        this.charTimes = [];
        // WPM: word timestamps in sliding window
        this.wordTimes = [];
        this.pendingWord = false; // true while mid-word (word chars typed, no boundary yet)
        // Session stats — persist until explicit reset, survive idle
        this.sessionWords = 0;
        this.sessionStart = 0; // timestamp of first completed word
        this.lastWordTime = 0; // timestamp of last completed word
        // Idle detection
        this.lastActivity = 0; // timestamp of any insertion
        this.visible = true;
        this.disposables = [];
        this.statusBar = vscode.window.createStatusBarItem('typingSpeedMeter', vscode.StatusBarAlignment.Right, 10000);
        this.statusBar.name = 'Typing Speed Meter';
        this.statusBar.command = 'typingSpeedMeter.reset';
        this.statusBar.tooltip =
            'Typing speed — real words counted (not chars/5)\n' +
                'avg = session total ÷ active span\n' +
                'Click to reset';
        this.statusBar.show();
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(e => this.onEdit(e)), vscode.commands.registerCommand('typingSpeedMeter.reset', () => this.reset()), vscode.commands.registerCommand('typingSpeedMeter.toggle', () => this.toggle()), vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('typingSpeedMeter'))
                this.refresh();
        }));
        this.tickTimer = setInterval(() => this.refresh(), 1000);
        this.refresh();
    }
    cfg() {
        return vscode.workspace.getConfiguration('typingSpeedMeter');
    }
    recordWord(now) {
        this.wordTimes.push(now);
        this.sessionWords++;
        this.lastWordTime = now;
        if (this.sessionStart === 0)
            this.sessionStart = now;
    }
    onEdit(event) {
        if (event.document.uri.scheme !== 'file' && event.document.uri.scheme !== 'untitled')
            return;
        const now = Date.now();
        this.lastActivity = now;
        for (const change of event.contentChanges) {
            const text = change.text;
            if (text.length === 0)
                continue; // pure deletion
            // CPM: one timestamp per inserted character
            for (let i = 0; i < text.length; i++)
                this.charTimes.push(now);
            if (text.length === 1) {
                // Single keystroke: track word boundaries
                if (/\w/.test(text)) {
                    // Word character — building a word
                    this.pendingWord = true;
                }
                else if (this.pendingWord) {
                    // Non-word character (space, (, ;, =, …) — word just finished
                    this.recordWord(now);
                    this.pendingWord = false;
                }
            }
            else {
                // Multi-char insertion (paste, autocomplete, snippet)
                if (/[\r\n]/.test(text)) {
                    // Newline present (Enter + indent, snippet, Copilot multi-line):
                    // treat as a word boundary — commit the pending word but don't
                    // count all the inserted tokens, which would inflate WPM on
                    // every autocomplete or snippet acceptance.
                    if (this.pendingWord) {
                        this.recordWord(now);
                        this.pendingWord = false;
                    }
                    this.pendingWord = /\w$/.test(text);
                }
                else {
                    // Single-line paste or autocomplete — count every \w+ token
                    const tokens = text.match(WORD_RE) ?? [];
                    for (const _ of tokens)
                        this.recordWord(now);
                    this.pendingWord = /\w$/.test(text);
                }
            }
        }
        this.refresh();
    }
    pruneTimes(arr) {
        const cutoff = Date.now() - this.cfg().get('windowSeconds', 10) * 1000;
        let i = 0;
        while (i < arr.length && arr[i] < cutoff)
            i++;
        if (i > 0)
            arr.splice(0, i);
    }
    isIdle() {
        const idleMs = this.cfg().get('idleResetSeconds', 5) * 1000;
        return this.lastActivity > 0 && Date.now() - this.lastActivity > idleMs;
    }
    currentWpm() {
        if (this.isIdle()) {
            // Clear sliding window but leave session avg intact
            this.wordTimes = [];
            this.pendingWord = false;
            return 0;
        }
        this.pruneTimes(this.wordTimes);
        if (this.wordTimes.length === 0)
            return 0;
        const windowMin = this.cfg().get('windowSeconds', 10) / 60;
        return Math.round(this.wordTimes.length / windowMin);
    }
    currentCpm() {
        if (this.isIdle()) {
            this.charTimes = [];
            return 0;
        }
        this.pruneTimes(this.charTimes);
        if (this.charTimes.length === 0)
            return 0;
        const windowMin = this.cfg().get('windowSeconds', 10) / 60;
        return Math.round(this.charTimes.length / windowMin);
    }
    // Session average: total words ÷ time from first to last word (excludes idle gaps)
    avgWpm() {
        if (this.sessionWords < 2 || this.sessionStart === 0)
            return 0;
        const elapsedMin = (this.lastWordTime - this.sessionStart) / 60000;
        if (elapsedMin < 0.017)
            return 0; // span < ~1 s, too short to be meaningful
        return Math.round(this.sessionWords / elapsedMin);
    }
    refresh() {
        if (!this.visible)
            return;
        const showCpm = this.cfg().get('showCharactersPerMinute', false);
        const avg = this.avgWpm();
        if (showCpm) {
            const cpm = this.currentCpm();
            const wpmEq = Math.round(cpm / 5);
            if (cpm === 0 && avg === 0) {
                this.statusBar.text = `$(keyboard) — CPM`;
                this.statusBar.color = undefined;
            }
            else {
                const avgStr = avg > 0 ? `  avg ${avg} WPM` : '';
                this.statusBar.text = `${this.speedIcon(wpmEq)} ${cpm} CPM${avgStr}`;
                this.statusBar.color = this.speedColor(wpmEq);
            }
        }
        else {
            const wpm = this.currentWpm();
            if (wpm === 0 && avg === 0) {
                this.statusBar.text = `$(keyboard) — WPM`;
                this.statusBar.color = undefined;
            }
            else if (wpm > 0 && avg > 0) {
                this.statusBar.text = `${this.speedIcon(wpm)} ${wpm} WPM  avg ${avg}`;
                this.statusBar.color = this.speedColor(wpm);
            }
            else if (wpm > 0) {
                this.statusBar.text = `${this.speedIcon(wpm)} ${wpm} WPM`;
                this.statusBar.color = this.speedColor(wpm);
            }
            else {
                // Idle after some typing — show avg as a reminder
                this.statusBar.text = `$(keyboard) — WPM  avg ${avg}`;
                this.statusBar.color = undefined;
            }
        }
    }
    speedIcon(wpm) {
        if (wpm >= 80)
            return '$(zap)';
        if (wpm >= 50)
            return '$(rocket)';
        if (wpm >= 20)
            return '$(keyboard)';
        return '$(edit)';
    }
    speedColor(wpm) {
        if (wpm >= 80)
            return '#ff9500';
        if (wpm >= 50)
            return '#ffe066';
        if (wpm >= 20)
            return undefined;
        return '#888888';
    }
    reset() {
        this.charTimes = [];
        this.wordTimes = [];
        this.pendingWord = false;
        this.sessionWords = 0;
        this.sessionStart = 0;
        this.lastWordTime = 0;
        this.lastActivity = 0;
        this.refresh();
    }
    toggle() {
        this.visible = !this.visible;
        if (this.visible) {
            this.statusBar.show();
            this.refresh();
        }
        else {
            this.statusBar.hide();
        }
    }
    dispose() {
        clearInterval(this.tickTimer);
        this.statusBar.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
let meter;
function activate(context) {
    meter = new TypingSpeedMeter();
    context.subscriptions.push(meter);
}
function deactivate() {
    meter?.dispose();
}
//# sourceMappingURL=extension.js.map