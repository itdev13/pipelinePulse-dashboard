import React, { useEffect, useMemo, useState } from 'react'
import { Select } from 'antd'
import { dealsAPI } from '../../api/deals'
import { useAuth } from '../../context/AuthContext'
import { TAG_CACHE } from './tagCatalogue'
import { contactsAPI } from '../../api/contacts'

// Owner and tag filters, shared by Contacts, Deals and Tasks.
//
// WHY THE OWNER FILTER DEFAULTS TO THE SIGNED-IN USER.
// A rep opening Deals wants their own deals. Before this, all three tabs
// opened on the whole sub-account and a rep with 14 deals scrolled past 300 to
// find them — the filter existed in the API and had no control in the UI at
// all.
//
// The default is applied ONCE, on first mount, and the choice is then
// remembered per tab by useTabState (2-hour expiry, so a new session starts
// clean). That matters for a manager: they switch to "All owners" once and it
// stays, rather than fighting a default that reasserts itself on every visit.
//
// WHY "MINE" IS NOT JUST A PRESELECTED NAME IN THE LIST.
// It is a distinct option that resolves to the current user's id at request
// time. A named entry would be identical in behaviour but would read as "this
// is filtered to Liam" rather than "this is filtered to you" — and it is the
// difference between a rep understanding why the list is short and thinking
// the account is empty.

export const MINE = '__mine__'
export const ALL = ''
export const UNASSIGNED = 'unassigned'

// The value to send to the API. MINE is a UI-level token: the server knows
// user ids and 'unassigned', not "mine".
export function resolveOwner(value, currentUserId) {
  if (value === MINE) return currentUserId || undefined
  if (!value) return undefined
  return value
}

// Users are location-wide and change rarely, so one fetch serves every tab for
// the session — three tabs each fetching on mount was three identical requests
// for a list that had not changed.
const USER_CACHE = { users: null, promise: null }

function useUsers() {
  const [users, setUsers] = useState(USER_CACHE.users || [])
  useEffect(() => {
    if (USER_CACHE.users) return
    if (!USER_CACHE.promise) {
      USER_CACHE.promise = dealsAPI.users()
        .then((r) => { USER_CACHE.users = r?.users || r || []; return USER_CACHE.users })
        // A failed user list must not take the page with it: the filter falls
        // back to Mine / All / Unassigned, which are the three that matter and
        // need no lookup.
        .catch(() => { USER_CACHE.users = []; return [] })
    }
    let alive = true
    USER_CACHE.promise.then((u) => { if (alive) setUsers(u) })
    return () => { alive = false }
  }, [])
  return users
}

function useTags() {
  const [tags, setTags] = useState(TAG_CACHE.tags || [])
  useEffect(() => {
    if (TAG_CACHE.tags) return
    if (!TAG_CACHE.promise) {
      // Same shape TagSelect stores: an array of NAMES, not objects. Sharing
      // the cache means whichever control mounts first pays for the fetch and
      // the other is instant — and a tag a rep invents in the editor shows up
      // in this filter without a reload.
      TAG_CACHE.promise = contactsAPI.tagCatalogue()
        .then((r) => {
          TAG_CACHE.tags = (r?.tags || []).map((t) => t.name).filter(Boolean)
          return TAG_CACHE.tags
        })
        .catch(() => { TAG_CACHE.tags = []; return [] })
    }
    let alive = true
    TAG_CACHE.promise.then((t) => { if (alive) setTags(t) })
    return () => { alive = false }
  }, [])
  return tags
}

export function OwnerFilter({ value, onChange, label = 'Owner', width = 170 }) {
  const { session } = useAuth()
  const users = useUsers()
  const myId = session?.user?.id || null

  // Someone whose GHL user id is not in the synced users table would otherwise
  // see "Mine" return nothing with no explanation. Hiding the option is worse
  // — it silently changes what the page does — so it stays and says why.
  const meKnown = !myId || users.some((u) => u.id === myId)

  const options = useMemo(() => {
    const head = []
    if (myId) head.push({ value: MINE, label: 'Mine' })
    head.push({ value: ALL, label: 'All owners' })
    head.push({ value: UNASSIGNED, label: 'Unassigned' })
    const rest = users
      .filter((u) => u.id && u.id !== myId)   // "Mine" already covers me
      .map((u) => ({ value: u.id, label: u.name || u.email || u.id }))
    return rest.length ? [...head, { label: '──────────', options: rest }] : head
  }, [users, myId])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{label}</span>
      <Select
        value={value}
        onChange={onChange}
        options={options}
        popupClassName="pp-menu"
        style={{ width }}
        styles={{ root: { height: 34 } }}
        title={meKnown ? undefined
          : 'Your user account is not in this sub-account\u2019s synced user list, so "Mine" may return nothing.'}
      />
    </span>
  )
}

export function TagFilter({ value, onChange, label = 'Tag', width = 160 }) {
  const tags = useTags()
  const options = useMemo(() => ([
    { value: '', label: 'Any tag' },
    ...[...tags].sort((a, b) => String(a).localeCompare(String(b)))
      .map((name) => ({ value: name, label: name }))
  ]), [tags])

  // No tags in the account = nothing to filter by. Rendering an empty dropdown
  // invites a rep to open it, find nothing and wonder what broke.
  if (tags.length === 0) return null

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{label}</span>
      <Select
        value={value}
        onChange={onChange}
        options={options}
        popupClassName="pp-menu"
        // Searchable: an account with 80 tags is a scroll, not a pick.
        showSearch
        optionFilterProp="label"
        style={{ width }}
        styles={{ root: { height: 34 } }}
      />
    </span>
  )
}

// The default a tab starts on. Separated so every tab agrees, and so the rule
// is stated once: signed in -> your own records; not identifiable -> everything,
// because an empty list with no explanation is the worse failure.
export function defaultOwner(session) {
  return session?.user?.id ? MINE : ALL
}
