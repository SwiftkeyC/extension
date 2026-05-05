"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
// One "word" = 5 characters (standard WPM definition)
const CHARS_PER_WORD = 5;
class TypingSpeedMeter {
    constructor() {
        this.keystrokeTimes = [];
        this.lastKeystrokeAt = 0;
        this.visible = true;
        this.disposables = [];
        this.statusBar = vscode.window.createStatusBarItem('typingSpeedMeter', vscode.StatusBarAlignment.Right, 10000 // high priority → far right, near the top-right area
        );
        this.statusBar.name = 'Typing Speed Meter';
        this.statusBar.command = 'typingSpeedMeter.reset';
        this.statusBar.tooltip = 'Typing speed (click to reset)\nWords per minute over sliding window';
        this.statusBar.show();
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(e => this.onEdit(e)), vscode.commands.registerCommand('typingSpeedMeter.reset', () => this.reset()), vscode.commands.registerCommand('typingSpeedMeter.toggle', () => this.toggle()), vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('typingSpeedMeter')) {
                this.refresh();
            }
        }));
        // Redraw every second even when idle so WPM decays naturally
        this.tickTimer = setInterval(() => this.refresh(), 1000);
        this.refresh();
    }
    cfg() {
        return vscode.workspace.getConfiguration('typingSpeedMeter');
    }
    onEdit(event) {
        // Ignore output / git / SCM virtual documents
        if (event.document.uri.scheme !== 'file' && event.document.uri.scheme !== 'untitled') {
            return;
        }
        const now = Date.now();
        let addedChars = 0;
        for (const change of event.contentChanges) {
            // Only count characters actually inserted (not deletions)
            addedChars += change.text.length;
        }
        if (addedChars > 0) {
            // Push one timestamp per character typed
            for (let i = 0; i < addedChars; i++) {
                this.keystrokeTimes.push(now);
            }
            this.lastKeystrokeAt = now;
            this.refresh();
        }
    }
    prune() {
        const windowMs = this.cfg().get('windowSeconds', 10) * 1000;
        const cutoff = Date.now() - windowMs;
        // Binary search would be faster but the array is tiny in practice
        let i = 0;
        while (i < this.keystrokeTimes.length && this.keystrokeTimes[i] < cutoff) {
            i++;
        }
        if (i > 0) {
            this.keystrokeTimes.splice(0, i);
        }
    }
    wpm() {
        this.prune();
        const idleMs = this.cfg().get('idleResetSeconds', 5) * 1000;
        if (this.lastKeystrokeAt && Date.now() - this.lastKeystrokeAt > idleMs) {
            this.keystrokeTimes = [];
            return 0;
        }
        const windowMinutes = this.cfg().get('windowSeconds', 10) / 60;
        return Math.round(this.keystrokeTimes.length / CHARS_PER_WORD / windowMinutes);
    }
    cpm() {
        this.prune();
        const idleMs = this.cfg().get('idleResetSeconds', 5) * 1000;
        if (this.lastKeystrokeAt && Date.now() - this.lastKeystrokeAt > idleMs) {
            return 0;
        }
        const windowMinutes = this.cfg().get('windowSeconds', 10) / 60;
        return Math.round(this.keystrokeTimes.length / windowMinutes);
    }
    refresh() {
        if (!this.visible) {
            return;
        }
        const showCpm = this.cfg().get('showCharactersPerMinute', false);
        const speed = showCpm ? this.cpm() : this.wpm();
        const unit = showCpm ? 'CPM' : 'WPM';
        if (speed === 0) {
            this.statusBar.text = `$(keyboard) — ${unit}`;
            this.statusBar.color = undefined;
        }
        else {
            const icon = this.speedIcon(speed, showCpm);
            this.statusBar.text = `${icon} ${speed} ${unit}`;
            this.statusBar.color = this.speedColor(speed, showCpm);
        }
    }
    // Returns a thematic icon based on speed tier
    speedIcon(speed, isCpm) {
        const wpm = isCpm ? speed / CHARS_PER_WORD : speed;
        if (wpm >= 80) {
            return '$(zap)';
        }
        if (wpm >= 50) {
            return '$(rocket)';
        }
        if (wpm >= 20) {
            return '$(keyboard)';
        }
        return '$(edit)';
    }
    // Subtle colour feedback: grey → white → yellow → orange
    speedColor(speed, isCpm) {
        const wpm = isCpm ? speed / CHARS_PER_WORD : speed;
        if (wpm >= 80) {
            return '#ff9500';
        } // fast  → orange
        if (wpm >= 50) {
            return '#ffe066';
        } // good  → yellow
        if (wpm >= 20) {
            return undefined;
        } // normal → theme default
        return '#888888'; // slow  → grey
    }
    reset() {
        this.keystrokeTimes = [];
        this.lastKeystrokeAt = 0;
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