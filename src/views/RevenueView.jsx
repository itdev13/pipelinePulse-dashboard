import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import ChartCard from '../components/ChartCard'
import RecordsModal from '../components/RecordsModal'
import TimelineModal from '../components/TimelineModal'
import { opportunityColumns, opportunityFilters } from '../components/opportunityColumns'
import { metricsAPI } from '../api/metrics'
import { STATUS_COLORS, num, money } from '../utils/format'

// Win rate by starting stage + outcome mix. Answers "which entry points produce
// winners, and where is revenue concentrated?"
export default function RevenueView({ filters }) {
  const [showData, setShowData] = useState(false)
  const [deal, setDeal] = useState(null)
  const winRate = useQuery({ queryKey: ['winRate', filters], queryFn: () => metricsAPI.winRate(filters) })
  const revenue = useQuery({ queryKey: ['revenue', filters], queryFn: () => metricsAPI.revenue(filters) })

  const wr = winRate.data?.data || []
  const rev = revenue.data?.data || {}
  const pie = [
    { name: 'Won', value: rev.won || 0, key: 'won' },
    { name: 'Open', value: rev.open || 0, key: 'open' },
    { name: 'Lost', value: rev.lost || 0, key: 'lost' },
    { name: 'Abandoned', value: rev.abandoned || 0, key: 'abandoned' },
  ].filter((s) => s.value > 0)

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Win rate by starting stage"
          subtitle="Where winning deals first entered the pipeline"
          hint="Grouped by first_stage_name — the stage each opp started in. Win % = won / total."
          loading={winRate.isLoading}
          error={winRate.error?.message}
          isEmpty={!wr.length}
          onShowData={() => setShowData(true)}
          emptyTitle="No opportunities yet"
          emptyHint="Win rates appear once opportunities are created and resolved."
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={wr} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="first_stage_name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis yAxisId="l" />
              <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="l" dataKey="won" name="Won" stackId="a" fill={STATUS_COLORS.won} radius={[0, 0, 0, 0]} />
              <Bar yAxisId="l" dataKey="lost" name="Lost" stackId="a" fill={STATUS_COLORS.lost} />
              <Bar yAxisId="l" dataKey="still_open" name="Open" stackId="a" fill={STATUS_COLORS.open} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Outcome mix"
          subtitle="Status breakdown across all opportunities"
          hint="Counts of won / open / lost / abandoned opportunities (excludes deleted)."
          loading={revenue.isLoading}
          error={revenue.error?.message}
          isEmpty={!pie.length}
          onShowData={() => setShowData(true)}
          emptyTitle="No opportunities yet"
          emptyHint="The outcome breakdown fills in as deals are won, lost, or abandoned."
        >
          <div className="flex items-center justify-around" style={{ height: 300 }}>
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {pie.map((s) => <Cell key={s.key} fill={STATUS_COLORS[s.key]} />)}
                </Pie>
                <Tooltip formatter={(v) => num(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500">Won revenue</div>
                <div className="text-2xl font-bold text-green-600">{money(rev.won_revenue)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Open pipeline</div>
                <div className="text-xl font-semibold text-primary-600">{money(rev.open_pipeline_value)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Avg won deal</div>
                <div className="text-lg font-medium">{money(rev.avg_won_deal)}</div>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      <RecordsModal
        open={showData}
        onClose={() => setShowData(false)}
        title="Opportunities — records"
        queryKey={['records', 'opps', filters]}
        fetchFn={() => metricsAPI.recordsOpportunities({ ...filters })}
        columns={opportunityColumns}
        filters={opportunityFilters}
        rowKey="opportunity_id"
      />
    </>
  )
}
