import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FunnelPlotOutlined, TrophyOutlined, TeamOutlined, MessageOutlined,
  FundOutlined, DollarOutlined, AimOutlined, RiseOutlined,
  FallOutlined, GlobalOutlined,
} from '@ant-design/icons'
import Header from './Header'
import FilterBar from './FilterBar'
import KpiCard from './KpiCard'
import FunnelView from '../views/FunnelView'
import RevenueView from '../views/RevenueView'
import ManagersView from '../views/ManagersView'
import MessagesView from '../views/MessagesView'
import LostView from '../views/LostView'
import AttributionView from '../views/AttributionView'
import { metricsAPI } from '../api/metrics'
import { currencySymbol } from '../utils/format'

// Section header — gives each band of charts a clear identity so the page
// reads as a top-to-bottom report rather than a wall of graphs.
function Section({ icon, title, desc, children }) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center text-base">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-bold text-gray-900 m-0 leading-tight">{title}</h2>
          <p className="text-xs text-gray-500 m-0 leading-tight">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

export default function Dashboard() {
  const qc = useQueryClient()
  // Default window: last 30 days. Stored in one place and threaded to every view.
  const [filters, setFilters] = useState({})

  // KPI strip is driven by the cheap aggregate endpoints so it loads instantly.
  const revenue = useQuery({ queryKey: ['revenue', filters], queryFn: () => metricsAPI.revenue(filters) })
  const winRate = useQuery({ queryKey: ['winRate', filters], queryFn: () => metricsAPI.winRate(filters) })

  const rev = revenue.data?.data || {}
  const wr = winRate.data?.data || []
  const totalOpps = wr.reduce((s, r) => s + (r.total_opps || 0), 0)
  const totalWon = wr.reduce((s, r) => s + (r.won || 0), 0)
  const overallWinPct = totalOpps ? (100 * totalWon) / totalOpps : null

  const refreshAll = () => qc.invalidateQueries()

  return (
    <div className="min-h-full">
      <Header />
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900 m-0">Pipeline overview</h1>
            <p className="text-sm text-gray-500 m-0">Live analytics across every opportunity in this sub-account</p>
          </div>
          <FilterBar filters={filters} onChange={setFilters} onRefresh={refreshAll} />
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KpiCard
            title="Open pipeline value" loading={revenue.isLoading} icon={<FundOutlined />}
            value={rev.open_pipeline_value || 0} prefix={currencySymbol()} accent="#3563e9"
            hint="Sum of monetary_value across all open opportunities"
          />
          <KpiCard
            title="Won revenue" loading={revenue.isLoading} icon={<DollarOutlined />}
            value={rev.won_revenue || 0} prefix={currencySymbol()} accent="#22c55e"
            hint="Sum of monetary_value across all won opportunities"
          />
          <KpiCard
            title="Overall win rate" loading={winRate.isLoading} icon={<AimOutlined />}
            value={overallWinPct} suffix="%" accent="#a855f7"
            hint="Won ÷ total opportunities across all starting stages"
          />
          <KpiCard
            title="Open deals" loading={revenue.isLoading} icon={<RiseOutlined />}
            value={rev.open || 0} accent="#f59e0b"
            hint="Count of currently-open opportunities"
          />
        </div>

        {/* All sections stacked — no tabs, everything visible top-to-bottom. */}
        <Section
          icon={<FunnelPlotOutlined />}
          title="Pipeline health"
          desc="How opportunities flow through stages and where they stall"
        >
          <FunnelView filters={filters} />
        </Section>

        <Section
          icon={<TrophyOutlined />}
          title="Win &amp; revenue"
          desc="Conversion outcomes and where revenue is concentrated"
        >
          <RevenueView filters={filters} />
        </Section>

        <Section
          icon={<FallOutlined />}
          title="Lost-deal analysis"
          desc="Where in the funnel opportunities are being lost"
        >
          <LostView filters={filters} />
        </Section>

        <Section
          icon={<TeamOutlined />}
          title="Sales manager performance"
          desc="Compare reps on deals, win rate, and revenue closed"
        >
          <ManagersView filters={filters} />
        </Section>

        <Section
          icon={<GlobalOutlined />}
          title="Marketing attribution"
          desc="Which UTM sources and campaigns produce revenue"
        >
          <AttributionView filters={filters} />
        </Section>

        <Section
          icon={<MessageOutlined />}
          title="Messaging &amp; delivery"
          desc="Conversation volume and SMS delivery health by stage"
        >
          <MessagesView filters={filters} />
        </Section>
      </div>
    </div>
  )
}
