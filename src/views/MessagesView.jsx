import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tag } from 'antd'
import dayjs from 'dayjs'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import ChartCard from '../components/ChartCard'
import RecordsModal from '../components/RecordsModal'
import { metricsAPI } from '../api/metrics'

// Columns shared by the "Show data" message tables.
const messageColumns = [
  { title: 'When', dataIndex: 'message_timestamp', width: 150, render: (v) => v ? dayjs(v).format('DD MMM YY, HH:mm') : '—' },
  { title: 'Stage', dataIndex: 'stage_name', width: 150, ellipsis: true },
  { title: 'Dir', dataIndex: 'message_direction', width: 90, render: (v) => <Tag color={v === 'outbound' ? 'purple' : 'blue'}>{v}</Tag> },
  { title: 'Channel', dataIndex: 'message_channel', width: 90 },
  {
    title: 'Status', dataIndex: 'message_status', width: 110,
    render: (v) => v ? <Tag color={/deliver|read/i.test(v) ? 'green' : /fail|undeliv/i.test(v) ? 'red' : 'default'}>{v}</Tag> : <Tag>none</Tag>,
  },
  { title: 'Message', dataIndex: 'body_preview', ellipsis: true },
]

// Message + delivery analytics. The delivery-rate-per-stage chart is what turns
// "are our texts even landing?" into a number agencies can act on.
// Filters available inside the message record modals.
const messageFilters = [
  { key: 'q', label: 'Search message', type: 'search', dataIndex: 'body_preview' },
  { key: 'stage', label: 'Stage', type: 'select', dataIndex: 'stage_name' },
  { key: 'direction', label: 'Direction', type: 'select', dataIndex: 'message_direction' },
  { key: 'channel', label: 'Channel', type: 'select', dataIndex: 'message_channel' },
  { key: 'status', label: 'Status', type: 'select', dataIndex: 'message_status' },
]

export default function MessagesView({ filters }) {
  const [showDelivery, setShowDelivery] = useState(false)
  const [showVolume, setShowVolume] = useState(false)

  const delivery = useQuery({ queryKey: ['msgDelivery', filters], queryFn: () => metricsAPI.messagesDelivery(filters) })
  const volume = useQuery({ queryKey: ['msgVolume', filters], queryFn: () => metricsAPI.messagesVolume(filters) })

  const del = delivery.data?.data || []
  const vol = volume.data?.data || []

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="SMS delivery rate by stage"
          subtitle="Outbound SMS — delivered / failed / other status"
          hint="Outbound SMS grouped by the stage they were sent in. 'Other' = statuses GHL reports that aren't delivered/read or failed/undelivered (e.g. sent, queued, or none). Delivery % = delivered ÷ sent."
          loading={delivery.isLoading}
          error={delivery.error?.message}
          isEmpty={!del.length}
          onShowData={() => setShowDelivery(true)}
          emptyTitle="No outbound SMS yet"
          emptyHint="Once SMS messages are sent in a stage, their delivery status appears here."
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={del} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="stage_name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="delivered" name="Delivered" stackId="a" fill="#22c55e" />
              <Bar dataKey="other" name="Other / unknown" stackId="a" fill="#cbd5e1" />
              <Bar dataKey="failed" name="Failed" stackId="a" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Message volume by channel"
          subtitle="Inbound vs outbound, per channel"
          hint="All persisted conversation messages grouped by channel and direction."
          loading={volume.isLoading}
          error={volume.error?.message}
          isEmpty={!vol.length}
          onShowData={() => setShowVolume(true)}
          emptyTitle="No messages captured yet"
          emptyHint="Messages are captured when an opportunity moves between stages."
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={vol} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="message_channel" width={100} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="inbound" name="Inbound" stackId="a" fill="#3563e9" />
              <Bar dataKey="outbound" name="Outbound" stackId="a" fill="#a855f7" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Show data → raw message records, with in-modal filters */}
      <RecordsModal
        open={showDelivery}
        onClose={() => setShowDelivery(false)}
        title="Outbound SMS — records"
        queryKey={['records', 'sms', filters]}
        fetchFn={() => metricsAPI.recordsMessages({ ...filters, channel: 'SMS', direction: 'outbound' })}
        columns={messageColumns}
        filters={messageFilters.filter((f) => !['channel', 'direction'].includes(f.key))}
        rowKey={(r, i) => `${r.opportunity_id}-${r.message_timestamp}-${i}`}
      />
      <RecordsModal
        open={showVolume}
        onClose={() => setShowVolume(false)}
        title="All messages — records"
        queryKey={['records', 'allmsg', filters]}
        fetchFn={() => metricsAPI.recordsMessages({ ...filters })}
        columns={messageColumns}
        filters={messageFilters}
        rowKey={(r, i) => `${r.opportunity_id}-${r.message_timestamp}-${i}`}
      />
    </>
  )
}
