import React from 'react'
import { Card, Button, Skeleton, Alert, Tooltip } from 'antd'
import { ArrowsAltOutlined, InfoCircleOutlined, InboxOutlined } from '@ant-design/icons'

// Standard wrapper for every chart on the dashboard. Handles the four states
// (loading / error / empty / data) uniformly and exposes the "expand" affordance
// that opens the drill-down. Keeping this consistent is what makes the whole
// dashboard feel like one product rather than a pile of charts.
export default function ChartCard({
  title,
  subtitle,
  hint,
  loading,
  error,
  isEmpty,
  onExpand,
  extra,
  children,
  emptyTitle,
  emptyHint,
  height = 300,
}) {
  return (
    <Card
      bordered={false}
      className="h-full rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)] hover:shadow-[0_2px_6px_rgba(16,24,40,0.06),0_12px_32px_-12px_rgba(16,24,40,0.16)] transition-shadow"
      styles={{ body: { padding: 20 } }}
      title={
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-800">{title}</span>
          {hint && (
            <Tooltip title={hint}>
              <InfoCircleOutlined className="text-gray-400 text-sm" />
            </Tooltip>
          )}
        </div>
      }
      extra={
        <div className="flex items-center gap-2">
          {extra}
          {onExpand && (
            <Button size="small" icon={<ArrowsAltOutlined />} onClick={onExpand}>
              Expand
            </Button>
          )}
        </div>
      }
    >
      {subtitle && <div className="text-xs text-gray-500 -mt-1 mb-3">{subtitle}</div>}
      <div style={{ minHeight: height }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : error ? (
          <Alert type="error" showIcon message="Couldn't load this metric" description={String(error)} />
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center text-center px-6" style={{ height }}>
            <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-300 text-xl mb-3">
              <InboxOutlined />
            </div>
            <div className="text-sm font-medium text-gray-600">{emptyTitle || 'Nothing to show yet'}</div>
            <div className="text-xs text-gray-400 mt-1 max-w-[260px]">
              {emptyHint || 'As opportunities move through your pipeline, this chart will fill in automatically.'}
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  )
}
