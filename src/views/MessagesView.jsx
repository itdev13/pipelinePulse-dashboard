import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal, Table, Tag } from 'antd'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import ChartCard from '../components/ChartCard'
import { metricsAPI } from '../api/metrics'
import { PALETTE, num, pct } from '../utils/format'

// Message + delivery analytics. The delivery-rate-per-stage chart is what turns
// "are our texts even landing?" into a number agencies can act on.
export default function MessagesView({ filters }) {
  const [expanded, setExpanded] = useState(false)
  const delivery = useQuery({ queryKey: ['msgDelivery', filters], queryFn: () => metricsAPI.messagesDelivery(filters) })
  const volume = useQuery({ queryKey: ['msgVolume', filters], queryFn: () => metricsAPI.messagesVolume(filters) })

  const del = delivery.data?.data || []
  const vol = volume.data?.data || []

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="SMS delivery rate by stage"
          subtitle="Outbound SMS — delivered vs failed"
          hint="Outbound SMS only, grouped by the stage the message was sent in. Delivery % = delivered / sent."
          loading={delivery.isLoading}
          error={delivery.error?.message}
          isEmpty={!del.length}
          onExpand={() => setExpanded(true)}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={del} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="stage_name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="delivered" name="Delivered" stackId="a" fill="#22c55e" />
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
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={vol} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="message_channel" width={100} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="inbound" name="Inbound" stackId="a" fill="#3563e9" />
              <Bar dataKey="outbound" name="Outbound" stackId="a" fill="#a855f7" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Modal
        title="SMS delivery detail by stage"
        open={expanded}
        onCancel={() => setExpanded(false)}
        footer={null}
        width={760}
      >
        <Table
          rowKey="stage_name"
          size="small"
          dataSource={del}
          pagination={false}
          columns={[
            { title: 'Stage', dataIndex: 'stage_name' },
            { title: 'Sent', dataIndex: 'sent', align: 'right', render: num },
            { title: 'Delivered', dataIndex: 'delivered', align: 'right', render: num },
            { title: 'Failed', dataIndex: 'failed', align: 'right', render: (v) => v ? <Tag color="red">{v}</Tag> : '0' },
            {
              title: 'Delivery %', dataIndex: 'delivery_pct', align: 'right',
              render: (v) => <span className={v < 90 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>{pct(v)}</span>,
              sorter: (a, b) => (a.delivery_pct || 0) - (b.delivery_pct || 0),
            },
          ]}
        />
      </Modal>
    </>
  )
}
