import React from 'react'
import { Card, Button, Empty, Skeleton, Alert, Tooltip } from 'antd'
import { ArrowsAltOutlined, InfoCircleOutlined } from '@ant-design/icons'

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
  height = 300,
}) {
  return (
    <Card
      bordered={false}
      className="shadow-sm h-full"
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
          <div className="flex items-center justify-center" style={{ height }}>
            <Empty description="No data yet for this view" />
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  )
}
