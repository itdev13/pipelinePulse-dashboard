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
      dealsAPI.list({ status: 'all', limit: 200 }).catch(() => null),
      businessesAPI.list({ limit: 200 }).catch(() => null)
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
