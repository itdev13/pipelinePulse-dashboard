import React from 'react'
import { DatePicker, Select, Button, Space } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { metricsAPI } from '../api/metrics'

const { RangePicker } = DatePicker

const PRESETS = [
  { label: 'Last 7 days', value: () => [dayjs().subtract(7, 'day'), dayjs()] },
  { label: 'Last 30 days', value: () => [dayjs().subtract(30, 'day'), dayjs()] },
  { label: 'Last 90 days', value: () => [dayjs().subtract(90, 'day'), dayjs()] },
  { label: 'This year', value: () => [dayjs().startOf('year'), dayjs()] },
]

// Global filters shared by every chart. Lifting these to one bar (rather than
// per-card) is deliberate: agencies compare apples-to-apples across the whole
// board, and one date range keeps the story coherent.
export default function FilterBar({ filters, onChange, onRefresh }) {
  const { data: pipelines } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => metricsAPI.pipelines(),
  })

  const range =
    filters.from && filters.to ? [dayjs(filters.from), dayjs(filters.to)] : null

  return (
    <div className="flex flex-wrap items-center gap-3">
      <RangePicker
        value={range}
        presets={PRESETS.map((p) => ({ label: p.label, value: p.value() }))}
        onChange={(vals) =>
          onChange({
            ...filters,
            from: vals?.[0]?.startOf('day').toISOString() || undefined,
            to: vals?.[1]?.endOf('day').toISOString() || undefined,
          })
        }
        allowClear
      />
      <Select
        style={{ minWidth: 200 }}
        placeholder="All pipelines"
        allowClear
        value={filters.pipelineId}
        onChange={(v) => onChange({ ...filters, pipelineId: v })}
        options={(pipelines?.data || []).map((p) => ({
          label: p.pipeline_name || p.pipeline_id,
          value: p.pipeline_id,
        }))}
      />
      <Space>
        <Button icon={<ReloadOutlined />} onClick={onRefresh}>
          Refresh
        </Button>
      </Space>
    </div>
  )
}
