import React from 'react'
import { Card, Statistic, Tooltip, Skeleton } from 'antd'
import { InfoCircleOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'

// Headline metric tile. The row of these across the top is the first thing an
// agency owner reads — keep them scannable and unambiguous.
export default function KpiCard({ title, value, suffix, prefix, hint, trend, loading, accent = '#3563e9' }) {
  return (
    <Card
      bordered={false}
      className="shadow-sm"
      styles={{ body: { padding: '18px 20px' } }}
      style={{ borderTop: `3px solid ${accent}` }}
    >
      {loading ? (
        <Skeleton active paragraph={false} title={{ width: '60%' }} />
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-[13px] text-gray-500 mb-1">
            <span>{title}</span>
            {hint && (
              <Tooltip title={hint}>
                <InfoCircleOutlined className="text-gray-400" />
              </Tooltip>
            )}
          </div>
          <Statistic
            value={value}
            precision={typeof value === 'number' && !Number.isInteger(value) ? 1 : 0}
            prefix={prefix}
            suffix={suffix}
            valueStyle={{ fontSize: 26, fontWeight: 700, color: '#111827' }}
          />
          {trend != null && (
            <div className={`mt-1 text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(trend)}%
            </div>
          )}
        </>
      )}
    </Card>
  )
}
