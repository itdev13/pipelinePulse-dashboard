import React from 'react'
import { Tag } from 'antd'
import dayjs from 'dayjs'
import { money } from '../utils/format'

const STATUS_TAG = { won: 'green', lost: 'red', open: 'blue', abandoned: 'default' }

// Shared antd column config for opportunity "Show data" tables.
export const opportunityColumns = [
  { title: 'Opportunity', dataIndex: 'name', ellipsis: true, render: (v) => v || '—' },
  {
    title: 'Status', dataIndex: 'status', width: 110,
    render: (v) => <Tag color={STATUS_TAG[v] || 'default'}>{v || '—'}</Tag>,
  },
  { title: 'Current stage', dataIndex: 'current_stage_name', width: 160, ellipsis: true, render: (v) => v || '—' },
  { title: 'Started in', dataIndex: 'first_stage_name', width: 160, ellipsis: true, render: (v) => v || '—' },
  { title: 'Owner', dataIndex: 'assigned_to_name', width: 140, render: (v) => v || <span className="text-gray-400">Unassigned</span> },
  { title: 'Value', dataIndex: 'monetary_value', align: 'right', width: 110, render: money, sorter: (a, b) => (a.monetary_value || 0) - (b.monetary_value || 0) },
  { title: 'Updated', dataIndex: 'updated_at', width: 140, render: (v) => v ? dayjs(v).format('DD MMM YY') : '—' },
]
