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
// Deliberately NOT persisted to localStorage. This is "where I was a moment
// ago", not a saved preference — coming back tomorrow to yesterday's filter
// still applied, with no visible reason, is worse than a clean page.
const store = new Map()

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
}
