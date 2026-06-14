import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tag, Segmented } from 'antd'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList,
} from 'recharts'
import ChartCard from '../components/ChartCard'
import RecordsModal from '../components/RecordsModal'
import { opportunityColumns, opportunityFilters } from '../components/opportunityColumns'
import { metricsAPI } from '../api/metrics'
import { PALETTE, hours, num } from '../utils/format'

// Columns for the stalled-deals records view (velocity card's "Show data").
const stalledColumns = [
  { title: 'Opportunity', dataIndex: 'opportunity_name', ellipsis: true },
  { title: 'Owner', dataIndex: 'owner', width: 150, render: (v) => v || <span className="text-gray-400">Unassigned</span> },
  { title: 'Stuck in', dataIndex: 'stuck_in', width: 160, render: (v) => <Tag>{v}</Tag> },
  {
    title: 'Days stuck', dataIndex: 'days_stuck', align: 'right', width: 110,
    sorter: (a, b) => a.days_stuck - b.days_stuck, defaultSortOrder: 'descend',
    render: (v) => <span className={v > 30 ? 'text-red-600 font-semibold' : ''}>{Number(v).toFixed(1)}</span>,
  },
]
const stalledFilters = [
  { key: 'q', label: 'Search opportunity', type: 'search', dataIndex: 'opportunity_name' },
  { key: 'stuck_in', label: 'Stage', type: 'select', dataIndex: 'stuck_in' },
  { key: 'owner', label: 'Owner', type: 'select', dataIndex: 'owner' },
]

// Pipeline funnel + stage velocity. Each card's "Show data" reveals the rows
// behind it — the funnel shows opportunities, velocity shows stalled deals.
export default function FunnelView({ filters }) {
  const [showOpps, setShowOpps] = useState(false)
  const [showStalled, setShowStalled] = useState(false)
  const [metric, setMetric] = useState('avg_hours')

  const funnel = useQuery({ queryKey: ['funnel', filters], queryFn: () => metricsAPI.funnel(filters) })
  const velocity = useQuery({ queryKey: ['velocity', filters], queryFn: () => metricsAPI.velocity(filters) })

  const funnelData = funnel.data?.data || []
  const velocityData = velocity.data?.data || []

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Conversion funnel"
          subtitle="Opportunities that entered each stage"
          hint="Counts every time an opp entered a stage (from stage_history). The top stage = 100%."
          loading={funnel.isLoading}
          error={funnel.error?.message}
          isEmpty={!funnelData.length}
          onShowData={() => setShowOpps(true)}
          emptyTitle="No stage activity yet"
          emptyHint="As opportunities enter stages, the funnel builds automatically."
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 32 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="stage_name" width={130} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(v, _k, item) => [
                  `${num(v)}  (${item?.payload?.pct_of_top_stage ?? 0}% of top stage)`,
                  'Entered',
                ]}
              />
              <Bar dataKey="entered" radius={[0, 6, 6, 0]}>
                {funnelData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                <LabelList dataKey="entered" position="right" formatter={(v) => num(v)} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Stage velocity"
          subtitle="How long deals sit in each stage"
          hint="Computed from closed stage occupancies. Switch between average, median, and P95."
          loading={velocity.isLoading}
          error={velocity.error?.message}
          isEmpty={!velocityData.length}
          onShowData={() => setShowStalled(true)}
          emptyTitle="No completed stage moves yet"
          emptyHint="Velocity needs deals that have moved out of a stage at least once."
          extra={
            <Segmented
              size="small"
              value={metric}
              onChange={setMetric}
              options={[
                { label: 'Avg', value: 'avg_hours' },
                { label: 'Median', value: 'median_hours' },
                { label: 'P95', value: 'p95_hours' },
              ]}
            />
          }
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={velocityData} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="stage_name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tickFormatter={(v) => `${v}h`} />
              <Tooltip formatter={(v) => [hours(v), 'Time in stage']} />
              <Bar dataKey={metric} fill="#3563e9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Funnel "Show data" → opportunity records */}
      <RecordsModal
        open={showOpps}
        onClose={() => setShowOpps(false)}
        title="Opportunities — records"
        queryKey={['records', 'funnelOpps', filters]}
        fetchFn={() => metricsAPI.recordsOpportunities({ ...filters })}
        columns={opportunityColumns}
        filters={opportunityFilters}
        rowKey="opportunity_id"
      />

      {/* Velocity "Show data" → stalled deals (> 7 days in current stage) */}
      <RecordsModal
        open={showStalled}
        onClose={() => setShowStalled(false)}
        title="Stalled deals — sitting in stage > 7 days"
        queryKey={['records', 'stalled', filters]}
        fetchFn={() => metricsAPI.stalled(filters, 7)}
        columns={stalledColumns}
        filters={stalledFilters}
        rowKey="opportunity_id"
      />
    </>
  )
}
