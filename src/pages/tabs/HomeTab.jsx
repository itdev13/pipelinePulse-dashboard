import React from 'react'
import { Shell, PageHeader, StateMessage } from '../shared/ListChrome'

// Home — the landing overview the client's nav adds (Oct 2026 design).
//
// A PLACEHOLDER. The tab exists so the nav matches the design and so the
// shell's position/history machinery has a real destination; the page itself
// is not designed yet. Nothing here is a feature: no fetch, no state, and the
// message says plainly that the overview is still to come, rather than
// rendering an empty frame that looks like a loading failure.
export default function HomeTab() {
  return (
    <Shell>
      <PageHeader title="Home" subtitle="An overview of this sub-account" />
      <StateMessage
        empty
        inline
        emptyIcon="home"
        emptyTitle="Overview coming soon"
        emptyText="This page will summarise the pipeline, open tasks and recent activity. Until then, Deal hub is the place to start."
      />
    </Shell>
  )
}
