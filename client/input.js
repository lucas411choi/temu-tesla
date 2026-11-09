// 키보드 입력: q w a s (바퀴) / e r d f (배출구). 서버가 자기 담당 키만 받으므로 클라이언트도 담당 키만 보낸다.
// 자폭 부활: R 은 배출구 키이므로 Shift+R 또는 Backspace 를 0.7초 누르고 있기
const CODES = { KeyQ: 1, KeyW: 2, KeyA: 4, KeyS: 8, KeyE: 16, KeyR: 32, KeyD: 64, KeyF: 128 };

export class Input {
  constructor(onMask, onSuicide) {
    this.onMask = onMask; this.onSuicide = onSuicide;
    this.mask = 0; this.allowed = 0; this.enabled = false; this.suicide = false; this.suicideKeys = new Set();
    window.addEventListener('keydown', (e) => this.key(e, true), { capture: true });
    window.addEventListener('keyup', (e) => this.key(e, false), { capture: true });
    window.addEventListener('blur', () => this.release());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); });
  }
  setAllowed(m) { this.allowed = m; }
  enable(on) { this.enabled = on; if (!on) this.release(); }
  release() {
    if (this.mask) { this.mask = 0; this.onMask(0); }
    this.suicideKeys.clear(); this.setSuicide();
  }
  setSuicide() { const on = this.suicideKeys.size > 0; if (on !== this.suicide) { this.suicide = on; this.onSuicide(on); } }
  key(e, down) {
    if (!this.enabled) return;
    const t = e.target && e.target.tagName;
    if (t === 'TEXTAREA' || t === 'SELECT' || (t === 'INPUT' && !['checkbox', 'range', 'button'].includes(e.target.type))) return;
    if (e.code === 'Backspace') { e.preventDefault(); if (e.repeat) return; if (down) this.suicideKeys.add('bs'); else this.suicideKeys.delete('bs'); this.setSuicide(); return; }
    const bit = CODES[e.code];
    if (!bit) return;
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyR' && (e.shiftKey || this.suicideKeys.has('sr'))) {      // Shift+R = 자폭 (배출구 r 아님)
      if (down) this.suicideKeys.add('sr'); else this.suicideKeys.delete('sr');
      this.setSuicide(); return;
    }
    const m = down ? this.mask | (bit & this.allowed) : this.mask & ~bit;
    if (m !== this.mask) { this.mask = m; this.onMask(m); }
  }
}
