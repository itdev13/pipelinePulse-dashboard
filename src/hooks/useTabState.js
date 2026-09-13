import { useCallback, useState } from 'react'

// State that survives leaving a tab and coming back.
//
// The shell renders tabs as `{activeTab === 'tasks' && <TasksTab/>}`, so
// switching away UNMOUNTS the component and every useState resets. A rep who
// filtered to "Due next 30 days", clicked a task through to its deal, and came
// back found the filter cleared and their place lost.
//
// The store is module-level rather than React state on purpose: it must outlive
// the component, and putting it in the shell would mean threading a prop for
// every filter on every page. Keyed by page, so two pages can both hold a `q`
// without colliding.
//
// Persisted, but with an EXPIRY.
//
// It was memory-only, which covered tab switches (the common case) but not a
// reload — and this app is an iframe inside GHL, where a reload is a routine
// thing rather than a rare one. A rep who filtered the deals list, opened a
// deal in the hub and hit refresh came back to a default list.
//
// Not plain localStorage though: coming back TOMORROW to yesterday's filter
// still applied, with no visible reason, is worse than a clean page. So the
// snapshot expires — long enough to survive a reload and a detour through
// another tab, short enough that a new session starts clean.
const STORE_KEY = 'pp.tabstate'
const MAX_AGE_MS = 2 * 60 * 60 * 1000   // 2 hours — a working session, not a day

// The sub-account this snapshot belongs to. A saved view id or a pipeline id
// from one sub-account is meaningless in another — and showing a rep another
// location's filters would look like a data leak even though the LIST is
// always fetched for the current location.
//
// Read from the shell's own stored position, which is already location-keyed,
// rather than threading a prop through every useTabState call site.
function currentLocationId() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('pp.position.')) return k.slice('pp.position.'.length)
    }
  } catch { /* storage blocked */ }
  return null
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
    if (!raw || typeof raw !== 'object') return new Map()
    // A stale snapshot is discarded wholesale rather than per key: the values
    // describe one moment together, and reviving half of them would leave a
    // filter applied with the view that produced it gone.
    if (!raw.at || Date.now() - raw.at > MAX_AGE_MS) return new Map()
    // Same reasoning for a different sub-account: drop it all.
    const loc = currentLocationId()
    if (loc && raw.loc && raw.loc !== loc) return new Map()
    return new Map(Object.entries(raw.values || {}))
  } catch {
    // Private mode, disabled storage, or a shape we no longer understand.
    return new Map()
  }
}

const store = load()

function persist() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        at: Date.now(),
        loc: currentLocationId(),
        values: Object.fromEntries(store)
      })
    )
  } catch {
    // Storage full or disabled. Losing the snapshot costs a rep their place;
    // throwing here would cost them the page.
  }
}

/**
 * Like useState, but the value is remembered per (page, key) for the lifetime
 * of the session.
 *
 * @param {string} page  e.g. 'tasks' — namespaces the key
 * @param {string} key   e.g. 'dueFilter'
 * @param {*} initial    used only when nothing has been remembered yet
 */
export function useTabState(page, key, initial) {
  const id = `${page}:${key}`
  const [value, setValue] = useState(() => (store.has(id) ? store.get(id) : initial))

  const set = useCallback((next) => {
    setValue((prev) => {
      // Support the updater form, or callers can't do setX(v => !v).
      const resolved = typeof next === 'function' ? next(prev) : next
      store.set(id, resolved)
      persist()
      return resolved
    })
  }, [id])

  return [value, set]
}

/**
 * Forget a page's remembered state.
 *
 * Used when a deliberate reset should stick — clearing a search, say — so the
 * next visit starts clean rather than restoring what was just cleared.
 */
export function clearTabState(page) {
  for (const id of [...store.keys()]) {
    if (id.startsWith(`${page}:`)) store.delete(id)
  }
  persist()
}
