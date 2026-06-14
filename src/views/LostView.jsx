import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, Cell,
} from 'recharts'
import ChartCard from '../components/ChartCard'
import RecordsModal from '../components/RecordsModal'
import TimelineModal from '../components/TimelineModal'
import { opportunityColumns, opportunityFilters } from '../components/opportunityColumns'
import { metricsAPI } from '../api/metrics'
import { num, money } from '../utils/format'

// Lost-deal analysis (query 7.11). "Where in the funnel do deals die?" — count
// of lost opps grouped by the stage they were in when lost, plus lost value.
export default function LostView({ filters }) {
  const [showData, setShowData] = useState(false)
  const [deal, setDeal] = useState(null)
  const q = useQuery({ queryKey: ['lost', filters], queryFn: () => metricsAPI.lostAnalysis(filters) })

  // Roll up to one bar per "lost_at" stage (the query splits by started_in too).
  const byStage = Object.values(
    (q.data?.data || []).reduce((acc, r) => {
      const k = r.lost_at || 'Unknown'
      acc[k] = acc[k] || { lost_at: k, opps_lost: 0, lost_value: 0 }
      acc[k].opps_lost += r.opps_lost
      acc[k].lost_value += Number(r.lost_value || 0)
      return acc
    }, {})
  ).sort((a, b) => b.opps_lost - a.opps_lost)

  return (
    <>
      <ChartCard
        title="Where deals are lost"
        subtitle="Lost opportunities grouped by the stage they died in"
        hint="Opportunities with status = lost, grouped by their current stage at loss. Taller bars = more leakage at that stage."
        loading={q.isLoading}
        error={q.error?.message}
        isEmpty={!byStage.length}
        onShowData={() => setShowData(true)}
        emptyTitle="No lost deals 🎉"
        emptyHint="When opportunities are marked lost, this shows where in the funnel they dropped."
        height={320}
      >
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={byStage} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="lost_at" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={70} />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(v, k) => (k === 'opps_lost' ? [num(v), 'Deals lost'] : [money(v), 'Lost value'])} />
            <Bar dataKey="opps_lost" name="Deals lost" radius={[6, 6, 0, 0]}>
              {byStage.map((_, i) => <Cell key={i} fill="#ef4444" />)}
              <LabelList dataKey="opps_lost" position="top" formatter={(v) => num(v)} fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <RecordsModal
        open={showData}
        onClose={() => setShowData(false)}
        title="Lost opportunities — records"
        queryKey={['records', 'lostOpps', filters]}
        fetchFn={() => metricsAPI.recordsOpportunities({ ...filters, status: 'lost' })}
        columns={opportunityColumns}
        filters={opportunityFilters}
        rowKey="opportunity_id"
        onRowClick={(r) => setDeal(r)}
      />
      <TimelineModal
        open={!!deal}
        onClose={() => setDeal(null)}
        opportunityId={deal?.opportunity_id}
        name={deal?.name}
      />
    </>
  )
}
