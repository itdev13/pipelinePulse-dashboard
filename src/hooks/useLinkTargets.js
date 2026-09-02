import { useEffect, useState } from 'react'
import { dealsAPI } from '../api/deals'
import { businessesAPI } from '../api/businesses'

// The deals and companies a note or task can be linked to.
//
// Used by the standalone Notes and Tasks pages, where there is no deal in
// scope, so the rep has to pick one. The Deal Hub's rails do NOT use this —
// they already know their deal and pass defaultOpportunityId instead, which
// hides the picker rather than offering a one-option dropdown.
//
// LAZY. `enabled` is false until an editor actually opens, so a rep who only
// reads the list never pays for two extra requests. Once fetched the result is
// kept for the life of the component: these lists change on the order of days,
// and refetching per editor open would be a request every time.
//
// A FAILED FETCH IS NOT AN ERROR HERE. Both lists degrade to empty, and the
// editors hide a picker whose list is empty — so a note can still be written
// without a link. Reporting "could not load deals" on a note dialog would be
// noise about a field the rep may not have wanted.
export function useLinkTargets(enabled) {
  const [targets, setTargets] = useState(null)

  useEffect(() => {
    if (!enabled || targets !== null) return
    let alive = true
    Promise.all([
      // status: 'all' — a note can legitimately be filed against a won or lost
      // deal, and the default list route returns open ones only.
      // 25, not 200. These are only a SEED — the pickers search the server for
      // anything not in this list (see searchDeals below), so preloading 200
      // rows to filter client-side was both a heavy request and a false
      // promise: it silently capped what could be found.
      dealsAPI.list({ status: 'all', limit: 25 }).catch(() => null),
      businessesAPI.list({ limit: 25 }).catch(() => null)
    ]).then(([d, b]) => {
      if (!alive) return
      // `deals` and `businesses` are the actual response keys — checked
      // against the route handlers, not guessed. An `|| items` fallback here
      // would silently mask a renamed key as "no deals found".
      setTargets({
        deals: d?.deals || [],
        businesses: b?.businesses || []
      })
    })
    return () => { alive = false }
  }, [enabled, targets])

  return targets || { deals: [], businesses: [] }
}

// Search functions for RemotePicker, shaped to { value, label }.
//
// Live here beside useLinkTargets so the seed list and the search that extends
// it agree on how a deal and a business are labelled — the note editor and the
// task editor both use these, and a label that differed between the two would
// look like two different records.
//
// `status: 'all'`: a note or task can legitimately be filed against a won or
// lost deal, and the list route defaults to open only.
//
// 20 rows, not 200: this is a search result the rep is about to pick from, not
// a list to browse. A longer page would just be more to scroll past.
const SEARCH_PAGE = 20

export function searchDeals(q) {
  return dealsAPI.list({ status: 'all', q, limit: SEARCH_PAGE })
    .then((r) => (r?.deals || []).map(dealOption))
}

export function searchBusinesses(q) {
  return businessesAPI.list({ q, limit: SEARCH_PAGE })
    .then((r) => (r?.businesses || []).map(businessOption))
}

// One place that decides what a deal is called in a picker. `dealTag` is the
// opportunity name; the fallbacks cover a deal with no name, which GHL allows.
export function dealOption(d) {
  return { value: d.id, label: d.dealTag || d.opportunityName || d.name || d.id }
}

export function businessOption(b) {
  return { value: b.id, label: b.name || b.id }
}
