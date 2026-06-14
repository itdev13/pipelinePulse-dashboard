import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import ChartCard from '../components/ChartCard'
import RecordsModal from '../components/RecordsModal'
import { metricsAPI } from '../api/metrics'
import { num, pct, money } from '../utils/format'

// UTM attribution (query 7.13). Which marketing sources/campaigns produce
// revenue — the "where should we spend more?" view for ad-running agencies.
const attributionColumns = [
  { title: 'Source', dataIndex: 'utm_source', render: (v) => v || '—' },
  { title: 'Campaign', dataIndex: 'utm_campaign', ellipsis: true, render: (v) => v || '—' },
  { title: 'Opps', dataIndex: 'opps', align: 'right', render: num, sorter: (a, b) => a.opps - b.opps },
  { title: 'Won', dataIndex: 'won', align: 'right', render: num },
  { title: 'Win %', dataIndex: 'win_pct', align: 'right', render: pct, sorter: (a, b) => (a.win_pct || 0) - (b.win_pct || 0) },
  {
    title: 'Won revenue', dataIndex: 'won_revenue', align: 'right', render: money,
    sorter: (a, b) => (a.won_revenue || 0) - (b.won_revenue || 0), defaultSortOrder: 'descend',
  },
]
const attributionFilters = [
  { key: 'utm_source', label: 'Source', type: 'select', dataIndex: 'utm_source' },
  { key: 'q', label: 'Search campaign', type: 'search', dataIndex: 'utm_campaign' },
]

export default function AttributionView({ filters }) {
  const [showData, setShowData] = useState(false)
  const q = useQuery({ queryKey: ['attribution', filters], queryFn: () => metricsAPI.attribution(filters) })
  const rows = q.data?.data || []

  // Top sources by won revenue for the chart (collapse campaigns into source).
  const bySource = Object.values(
    rows.reduce((acc, r) => {
      const k = r.utm_source || 'unknown'
      acc[k] = acc[k] || { utm_source: k, opps: 0, won: 0, won_revenue: 0 }
      acc[k].opps += r.opps
      acc[k].won += r.won
      acc[k].won_revenue += Number(r.won_revenue || 0)
      return acc
    }, {})
  ).sort((a, b) => b.won_revenue - a.won_revenue).slice(0, 10)

  return (
    <>
      <ChartCard
        title="Marketing attribution"
        subtitle="Won revenue by UTM source"
        hint="Opportunities joined to their contact's utm_source. Bar = won revenue per source (top 10). Use Show data for the full source × campaign breakdown with win rates."
        loading={q.isLoading}
        error={q.error?.message}
        isEmpty={!bySource.length}
        onShowData={() => setShowData(true)}
        emptyTitle="No UTM data yet"
        emptyHint="Once contacts carry utm_source values, attribution appears here."
        height={340}
      >
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={bySource} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="utm_source" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={70} />
            <YAxis tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v, k) => (k === 'won_revenue' ? [money(v), 'Won revenue'] : [num(v), k])} />
            <Legend />
            <Bar dataKey="won_revenue" name="Won revenue" fill="#22c55e" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <RecordsModal
        open={showData}
        onClose={() => setShowData(false)}
        title="Marketing attribution — source × campaign"
        queryKey={['attribution', filters]}
        fetchFn={() => metricsAPI.attribution(filters)}
        columns={attributionColumns}
        filters={attributionFilters}
        rowKey={(r, i) => `${r.utm_source}-${r.utm_campaign}-${i}`}
      />
    </>
  )
}
