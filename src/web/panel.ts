// panel.ts — the control panel a human uses to drive the face.
//
// A feeling/situation input + Run button + preset chips, a connection-status
// readout, and a live instrument-style transcript log. Emotional words live only
// here (the prompt we hand the model) and in the log — never in the face controls.

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

/** Log entry kinds. These mirror ServerMessage transcript kinds plus run markers. */
export type LogKind =
  | 'runStarted'
  | 'reasoning'
  | 'program'
  | 'state'
  | 'error'
  | 'info'
  | 'runEnded'

export interface Panel {
  setStatus(status: ConnectionStatus): void
  log(kind: LogKind, text: string): void
  /** A run began on the server: mark in-flight and log the prompt. */
  runStarted(prompt: string): void
  /** A run finished: re-enable Run and log the outcome. */
  runEnded(text?: string): void
}

export interface PanelOptions {
  /** Start a run. `resetFirst` is the "reset to neutral before each run" toggle state.
   *  Returns false if the request could not be sent, so the panel does not enter (and get
   *  stuck in) the in-flight state. */
  onRun(prompt: string, resetFirst: boolean): boolean
  /** Notified whenever the in-flight state changes — true from a successful Run submit
   *  until runEnded (or a disconnect clears it). Lets a caller drive a run-scoped indicator
   *  such as the face's thinking chrome off the same flag that gates the Run button. */
  onRunningChange?(running: boolean): void
}

// A few starting points: three feelings and one situation. Emotional vocabulary
// is fine here — it is the prompt handed to the model, not a face control.
const PRESETS: string[] = [
  'curious',
  'suspicious',
  'sleepy',
  'you just realized you left the oven on',
]

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'connecting',
  connected: 'live',
  disconnected: 'offline',
}

const KIND_LABEL: Record<LogKind, string> = {
  runStarted: 'RUN',
  reasoning: 'THINK',
  program: 'DSL',
  state: 'STATE',
  error: 'ERR',
  info: 'INFO',
  runEnded: 'END',
}

export function createPanel(container: HTMLElement, opts: PanelOptions): Panel {
  container.innerHTML = `
    <header class="panel-head">
      <div class="wordmark">
        <span class="mark">wallai</span>
        <span class="sub">expression instrument</span>
      </div>
      <div class="status" data-status="connecting">
        <span class="status-dot"></span>
        <span class="status-text">connecting</span>
      </div>
    </header>

    <form class="run-form" novalidate>
      <label class="field-label" for="prompt-input">Feeling or situation</label>
      <div class="field-row">
        <input id="prompt-input" class="prompt-input" type="text" autocomplete="off"
               placeholder="e.g. suspicious, or a scene to react to" />
        <button type="submit" class="run-btn">Run</button>
      </div>
      <div class="chips"></div>
      <label class="run-opt">
        <input type="checkbox" class="reset-toggle" checked />
        <span>Reset to neutral before each run</span>
      </label>
    </form>

    <section class="log-wrap" aria-live="polite">
      <div class="log-head">Transcript</div>
      <ol class="log"></ol>
    </section>
  `

  const $ = <T extends Element>(sel: string): T => {
    const el = container.querySelector<T>(sel)
    if (!el) throw new Error(`panel: missing element ${sel}`)
    return el
  }

  const statusEl = $<HTMLDivElement>('.status')
  const statusText = $<HTMLSpanElement>('.status-text')
  const form = $<HTMLFormElement>('.run-form')
  const input = $<HTMLInputElement>('#prompt-input')
  const runBtn = $<HTMLButtonElement>('.run-btn')
  const chipsEl = $<HTMLDivElement>('.chips')
  const resetToggle = $<HTMLInputElement>('.reset-toggle')
  const logEl = $<HTMLOListElement>('.log')

  let status: ConnectionStatus = 'connecting'
  let running = false

  // Sync every control derived from (running, status): the Run button's enabled
  // state, and whether the status dot pulses. The dot pulses ONLY while a run is
  // in flight (data-running drives the CSS) — a still dot means connected-and-idle,
  // so the indicator reads as honest activity, not a perpetual "loading" heartbeat.
  function syncControls(): void {
    runBtn.disabled = running || status !== 'connected'
    statusEl.setAttribute('data-running', String(running))
    // Same flag drives the face's thinking chrome, so it spans exactly the run window.
    opts.onRunningChange?.(running)
  }

  function submit(prompt: string): void {
    const trimmed = prompt.trim()
    if (!trimmed || running || status !== 'connected') return
    input.value = trimmed
    // Only enter the in-flight state if the request actually went out; a failed send
    // (socket not open) must not leave Run stuck disabled.
    if (opts.onRun(trimmed, resetToggle.checked)) {
      running = true
      syncControls()
    }
  }

  // Preset chips fill the input and run in one tap.
  for (const preset of PRESETS) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'chip'
    chip.textContent = preset
    chip.addEventListener('click', () => submit(preset))
    chipsEl.appendChild(chip)
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    submit(input.value)
  })

  function setStatus(next: ConnectionStatus): void {
    status = next
    // A connection that isn't live can't have a run in flight from this client's view.
    // Clearing here is what unsticks Run after a mid-run disconnect: the lost runEnded
    // never arrives, so the reconnect ('connected') must find running already false.
    if (next !== 'connected') running = false
    statusEl.setAttribute('data-status', next)
    statusText.textContent = STATUS_LABEL[next]
    syncControls()
  }

  function log(kind: LogKind, text: string): void {
    const atBottom =
      logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 24

    const li = document.createElement('li')
    li.className = `log-entry kind-${kind}`

    const tag = document.createElement('span')
    tag.className = 'log-tag'
    tag.textContent = KIND_LABEL[kind]

    const body = document.createElement('span')
    body.className = 'log-body'
    body.textContent = text

    li.appendChild(tag)
    li.appendChild(body)
    logEl.appendChild(li)

    // Keep newest activity visible if the reader was already at the bottom.
    if (atBottom) logEl.scrollTop = logEl.scrollHeight
  }

  function runStarted(prompt: string): void {
    running = true
    syncControls()
    log('runStarted', prompt)
  }

  function runEnded(text?: string): void {
    running = false
    syncControls()
    log('runEnded', text ?? 'run complete')
  }

  // Initial paint.
  setStatus('connecting')

  return { setStatus, log, runStarted, runEnded }
}
