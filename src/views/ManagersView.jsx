import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal, Table, Segmented } from 'antd'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import ChartCard from '../components/ChartCard'
import { metricsAPI } from '../api/metrics'
import { num, pct, money } from '../utils/format'

// Per-sales-manager performance. Agencies use this to spot who's closing and
// who needs coaching — the single most-requested rep view.
export default function ManagersView({ filters }) {
  const [expanded, setExpanded] = useState(false)
  const [metric, setMetric] = useState('won_revenue')
  const q = useQuery({ queryKey: ['managers', filters], queryFn: () => metricsAPI.managers(filters) })
  const data = q.data?.data || []

  const metricLabel = {
    won_revenue: 'Won revenue', win_pct: 'Win %', opps_owned: 'Deals owned', avg_deal_size: 'Avg deal size',
  }[metric]

  return (
    <>
      <ChartCard
        title="Sales manager comparison"
        subtitle="Ranked by the selected metric"
        hint="Per assigned_to_name (excludes deleted + unassigned). Switch the metric on the right."
        loading={q.isLoading}
        error={q.error?.message}
        isEmpty={!data.length}
        onExpand={() => setExpanded(true)}
        height={340}
        extra={
          <Segmented
            size="small"
            value={metric}
            onChange={setMetric}
            options={[
              { label: 'Revenue', value: 'won_revenue' },
              { label: 'Win %', value: 'win_pct' },
              { label: 'Deals', value: 'opps_owned' },
            ]}
          />
        }
      >
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={data} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="assigned_to_name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={70} />
            <YAxis tickFormatter={(v) => (metric === 'won_revenue' ? `£${(v / 1000).toFixed(0)}k` : metric === 'win_pct' ? `${v}%` : v)} />
            <Tooltip
              formatter={(v) =>
                metric === 'won_revenue' ? [money(v), metricLabel]
                  : metric === 'win_pct' ? [pct(v), metricLabel]
                    : [num(v), metricLabel]
              }
            />
            <Legend />
            <Bar dataKey={metric} name={metricLabel} fill="#3563e9" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Modal
        title="Sales manager performance"
        open={expanded}
        onCancel={() => setExpanded(false)}
        footer={null}
        width={920}
      >
        <Table
          rowKey="assigned_to_name"
          size="small"
          dataSource={data}
          pagination={false}
          columns={[
            { title: 'Manager', dataIndex: 'assigned_to_name' },
            { title: 'Deals', dataIndex: 'opps_owned', align: 'right', render: num, sorter: (a, b) => a.opps_owned - b.opps_owned },
            { title: 'Won', dataIndex: 'won', align: 'right', render: num },
            { title: 'Lost', dataIndex: 'lost', align: 'right', render: num },
            { title: 'Win %', dataIndex: 'win_pct', align: 'right', render: pct, sorter: (a, b) => (a.win_pct || 0) - (b.win_pct || 0) },
            { title: 'Avg deal', dataIndex: 'avg_deal_size', align: 'right', render: money },
            {
              title: 'Won revenue', dataIndex: 'won_revenue', align: 'right', render: money,
              sorter: (a, b) => (a.won_revenue || 0) - (b.won_revenue || 0), defaultSortOrder: 'descend',
            },
          ]}
        />
      </Modal>
    </>
  )
}
