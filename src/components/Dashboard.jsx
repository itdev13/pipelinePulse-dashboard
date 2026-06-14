import React, { useState } from 'react'
import { Tabs } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FunnelPlotOutlined, TrophyOutlined, TeamOutlined, MessageOutlined,
} from '@ant-design/icons'
import Header from './Header'
import FilterBar from './FilterBar'
import KpiCard from './KpiCard'
import FunnelView from '../views/FunnelView'
import RevenueView from '../views/RevenueView'
import ManagersView from '../views/ManagersView'
import MessagesView from '../views/MessagesView'
import { metricsAPI } from '../api/metrics'
import { money, num, pct } from '../utils/format'

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

  const tabs = [
    { key: 'funnel', label: <span><FunnelPlotOutlined /> Pipeline</span>, children: <FunnelView filters={filters} /> },
    { key: 'revenue', label: <span><TrophyOutlined /> Win &amp; Revenue</span>, children: <RevenueView filters={filters} /> },
    { key: 'managers', label: <span><TeamOutlined /> Managers</span>, children: <ManagersView filters={filters} /> },
    { key: 'messages', label: <span><MessageOutlined /> Messages</span>, children: <MessagesView filters={filters} /> },
  ]

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            title="Open pipeline value" loading={revenue.isLoading}
            value={rev.open_pipeline_value || 0} prefix="£" accent="#3563e9"
            hint="Sum of monetary_value across all open opportunities"
          />
          <KpiCard
            title="Won revenue" loading={revenue.isLoading}
            value={rev.won_revenue || 0} prefix="£" accent="#22c55e"
            hint="Sum of monetary_value across all won opportunities"
          />
          <KpiCard
            title="Overall win rate" loading={winRate.isLoading}
            value={overallWinPct} suffix="%" accent="#a855f7"
            hint="Won ÷ total opportunities across all starting stages"
          />
          <KpiCard
            title="Open deals" loading={revenue.isLoading}
            value={rev.open || 0} accent="#f59e0b"
            hint="Count of currently-open opportunities"
          />
        </div>

        <Tabs items={tabs} size="large" />
      </div>
    </div>
  )
}
