"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
// Matches \w+ identifiers OR any single non-whitespace syntax character
const TOKEN_RE = /\w+|[^\w\s]/g;
class TypingSpeedMeter {
    constructor() {
        this.charTimes = [];
        this.tokenTimes = [];
        this.pendingWord = false;
        this.sessionTokens = 0;
        this.sessionStart = 0;
        this.lastTokenTime = 0;
        this.lastActivity = 0;
        this.visible = true;
        this.disposables = [];
        this.statusBar = vscode.window.createStatusBarItem('typingSpeedMeter', vscode.StatusBarAlignment.Right, 10000);
        this.statusBar.name = 'Typing Speed Meter';
        this.statusBar.command = 'typingSpeedMeter.reset';
        this.statusBar.tooltip =
            'Typing speed — code tokens counted (words + operators + brackets)\n' +
                'avg = session total ÷ active span\n' +
                'Click to reset';
        this.statusBar.show();
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(e => this.onEdit(e)), 
        // Reset pending word state when switching files so it doesn't bleed over
        vscode.window.onDidChangeActiveTextEditor(() => { this.pendingWord = false; }), vscode.commands.registerCommand('typingSpeedMeter.reset', () => this.reset()), vscode.commands.registerCommand('typingSpeedMeter.toggle', () => this.toggle()), vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('typingSpeedMeter'))
                this.refresh();
        }));
        this.tickTimer = setInterval(() => this.refresh(), 1000);
        this.refresh();
    }
    cfg() {
        return vscode.workspace.getConfiguration('typingSpeedMeter');
    }
    recordToken(now) {
        this.tokenTimes.push(now);
        this.sessionTokens++;
        this.lastTokenTime = now;
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
            for (let i = 0; i < text.length; i++)
                this.charTimes.push(now);
            if (text.length === 1) {
                if (/\w/.test(text)) {
                    if (!this.pendingWord) {
                        // First char of a new identifier/keyword — count it now
                        // so the word is always recorded even without a terminator
                        this.recordToken(now);
                        this.pendingWord = true;
                    }
                    // else: still inside the same word, don't double-count
                }
                else if (/\S/.test(text)) {
                    // Operator, bracket, punctuation — each is its own token
                    this.pendingWord = false;
                    this.recordToken(now);
                }
                else {
                    // Whitespace — boundary only, no token
                    this.pendingWord = false;
                }
            }
            else {
                // Multi-char insertion (paste, autocomplete, snippet):
                // TOKEN_RE captures every complete \w+ word and every syntax char
                this.pendingWord = false;
                const tokens = text.match(TOKEN_RE) ?? [];
                for (const _ of tokens)
                    this.recordToken(now);
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
            this.tokenTimes = [];
            this.pendingWord = false;
            return 0;
        }
        this.pruneTimes(this.tokenTimes);
        if (this.tokenTimes.length === 0)
            return 0;
        const windowMin = this.cfg().get('windowSeconds', 10) / 60;
        return Math.round(this.tokenTimes.length / windowMin);
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
    avgWpm() {
        if (this.sessionTokens < 2 || this.sessionStart === 0)
            return 0;
        const elapsedMin = (this.lastTokenTime - this.sessionStart) / 60000;
        if (elapsedMin < 0.017)
            return 0;
        return Math.round(this.sessionTokens / elapsedMin);
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
        this.tokenTimes = [];
        this.pendingWord = false;
        this.sessionTokens = 0;
        this.sessionStart = 0;
        this.lastTokenTime = 0;
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