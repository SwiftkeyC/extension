import * as vscode from 'vscode';

// Matches \w+ identifiers OR any single non-whitespace syntax character
const TOKEN_RE = /\w+|[^\w\s]/g;

class TypingSpeedMeter implements vscode.Disposable {
    private readonly statusBar: vscode.StatusBarItem;

    private charTimes: number[] = [];
    private tokenTimes: number[] = [];
    private pendingWord = false;

    private sessionTokens = 0;
    private sessionStart = 0;
    private lastTokenTime = 0;
    private lastActivity = 0;

    private visible = true;
    private tickTimer: ReturnType<typeof setInterval>;
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.statusBar = vscode.window.createStatusBarItem(
            'typingSpeedMeter',
            vscode.StatusBarAlignment.Right,
            10000
        );
        this.statusBar.name = 'Typing Speed Meter';
        this.statusBar.command = 'typingSpeedMeter.reset';
        this.statusBar.tooltip =
            'Typing speed — code tokens counted (words + operators + brackets)\n' +
            'avg = session total ÷ active span\n' +
            'Click to reset';
        this.statusBar.show();

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => this.onEdit(e)),
            // Reset pending word state when switching files so it doesn't bleed over
            vscode.window.onDidChangeActiveTextEditor(() => { this.pendingWord = false; }),
            vscode.commands.registerCommand('typingSpeedMeter.reset', () => this.reset()),
            vscode.commands.registerCommand('typingSpeedMeter.toggle', () => this.toggle()),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('typingSpeedMeter')) this.refresh();
            })
        );

        this.tickTimer = setInterval(() => this.refresh(), 1000);
        this.refresh();
    }

    private cfg() {
        return vscode.workspace.getConfiguration('typingSpeedMeter');
    }

    private recordToken(now: number): void {
        this.tokenTimes.push(now);
        this.sessionTokens++;
        this.lastTokenTime = now;
        if (this.sessionStart === 0) this.sessionStart = now;
    }

    private onEdit(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.uri.scheme !== 'file' && event.document.uri.scheme !== 'untitled') return;

        const now = Date.now();
        this.lastActivity = now;

        for (const change of event.contentChanges) {
            const text = change.text;
            if (text.length === 0) continue; // pure deletion

            for (let i = 0; i < text.length; i++) this.charTimes.push(now);

            if (text.length === 1) {
                if (/\w/.test(text)) {
                    if (!this.pendingWord) {
                        // First char of a new identifier/keyword — count it now
                        // so the word is always recorded even without a terminator
                        this.recordToken(now);
                        this.pendingWord = true;
                    }
                    // else: still inside the same word, don't double-count
                } else if (/\S/.test(text)) {
                    // Operator, bracket, punctuation — each is its own token
                    this.pendingWord = false;
                    this.recordToken(now);
                } else {
                    // Whitespace — boundary only, no token
                    this.pendingWord = false;
                }
            } else {
                // Multi-char insertion (paste, autocomplete, snippet):
                // TOKEN_RE captures every complete \w+ word and every syntax char
                this.pendingWord = false;
                const tokens = text.match(TOKEN_RE) ?? [];
                for (const _ of tokens) this.recordToken(now);
            }
        }

        this.refresh();
    }

    private pruneTimes(arr: number[]): void {
        const cutoff = Date.now() - this.cfg().get<number>('windowSeconds', 10) * 1000;
        let i = 0;
        while (i < arr.length && arr[i] < cutoff) i++;
        if (i > 0) arr.splice(0, i);
    }

    private isIdle(): boolean {
        const idleMs = this.cfg().get<number>('idleResetSeconds', 5) * 1000;
        return this.lastActivity > 0 && Date.now() - this.lastActivity > idleMs;
    }

    private currentWpm(): number {
        if (this.isIdle()) {
            this.tokenTimes = [];
            this.pendingWord = false;
            return 0;
        }
        this.pruneTimes(this.tokenTimes);
        if (this.tokenTimes.length === 0) return 0;
        const windowMin = this.cfg().get<number>('windowSeconds', 10) / 60;
        return Math.round(this.tokenTimes.length / windowMin);
    }

    private currentCpm(): number {
        if (this.isIdle()) {
            this.charTimes = [];
            return 0;
        }
        this.pruneTimes(this.charTimes);
        if (this.charTimes.length === 0) return 0;
        const windowMin = this.cfg().get<number>('windowSeconds', 10) / 60;
        return Math.round(this.charTimes.length / windowMin);
    }

    private avgWpm(): number {
        if (this.sessionTokens < 2 || this.sessionStart === 0) return 0;
        const elapsedMin = (this.lastTokenTime - this.sessionStart) / 60000;
        if (elapsedMin < 0.017) return 0;
        return Math.round(this.sessionTokens / elapsedMin);
    }

    refresh(): void {
        if (!this.visible) return;

        const showCpm = this.cfg().get<boolean>('showCharactersPerMinute', false);
        const avg = this.avgWpm();

        if (showCpm) {
            const cpm = this.currentCpm();
            const wpmEq = Math.round(cpm / 5);
            if (cpm === 0 && avg === 0) {
                this.statusBar.text = `$(keyboard) — CPM`;
                this.statusBar.color = undefined;
            } else {
                const avgStr = avg > 0 ? `  avg ${avg} WPM` : '';
                this.statusBar.text = `${this.speedIcon(wpmEq)} ${cpm} CPM${avgStr}`;
                this.statusBar.color = this.speedColor(wpmEq);
            }
        } else {
            const wpm = this.currentWpm();
            if (wpm === 0 && avg === 0) {
                this.statusBar.text = `$(keyboard) — WPM`;
                this.statusBar.color = undefined;
            } else if (wpm > 0 && avg > 0) {
                this.statusBar.text = `${this.speedIcon(wpm)} ${wpm} WPM  avg ${avg}`;
                this.statusBar.color = this.speedColor(wpm);
            } else if (wpm > 0) {
                this.statusBar.text = `${this.speedIcon(wpm)} ${wpm} WPM`;
                this.statusBar.color = this.speedColor(wpm);
            } else {
                this.statusBar.text = `$(keyboard) — WPM  avg ${avg}`;
                this.statusBar.color = undefined;
            }
        }
    }

    private speedIcon(wpm: number): string {
        if (wpm >= 100) return '$(star-full)';
        if (wpm >= 90) return '$(flame)';
        if (wpm >= 80) return '$(zap)';
        if (wpm >= 50) return '$(rocket)';
        if (wpm >= 20) return '$(keyboard)';
        return '$(edit)';
    }

    private speedColor(wpm: number): vscode.ThemeColor | string | undefined {
        if (wpm >= 100) return '#ffffff';
        if (wpm >= 90) return '#b57bee';
        if (wpm >= 80) return '#ff9500';
        if (wpm >= 50) return '#ffe066';
        if (wpm >= 20) return undefined;
        return '#888888';
    }

    reset(): void {
        this.charTimes = [];
        this.tokenTimes = [];
        this.pendingWord = false;
        this.sessionTokens = 0;
        this.sessionStart = 0;
        this.lastTokenTime = 0;
        this.lastActivity = 0;
        this.refresh();
    }

    toggle(): void {
        this.visible = !this.visible;
        if (this.visible) {
            this.statusBar.show();
            this.refresh();
        } else {
            this.statusBar.hide();
        }
    }

    dispose(): void {
        clearInterval(this.tickTimer);
        this.statusBar.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

let meter: TypingSpeedMeter | undefined;

export function activate(context: vscode.ExtensionContext): void {
    meter = new TypingSpeedMeter();
    context.subscriptions.push(meter);
}

export function deactivate(): void {
    meter?.dispose();
}
