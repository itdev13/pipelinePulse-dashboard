import React from 'react'
import { Card, Statistic, Tooltip, Skeleton } from 'antd'
import { InfoCircleOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'

// Headline metric tile. The row of these across the top is the first thing an
// agency owner reads — keep them scannable and unambiguous.
export default function KpiCard({ title, value, suffix, prefix, hint, trend, loading, icon, accent = '#3563e9' }) {
  return (
    <Card
      bordered={false}
      className="relative overflow-hidden rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)]"
      styles={{ body: { padding: '18px 20px' } }}
    >
      {/* gradient accent rail */}
      <span
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: `linear-gradient(${accent}, ${accent}99)` }}
      />
      {loading ? (
        <Skeleton active paragraph={false} title={{ width: '60%' }} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-gray-500 uppercase tracking-wide">
              <span>{title}</span>
              {hint && (
                <Tooltip title={hint}>
                  <InfoCircleOutlined className="text-gray-300 normal-case" />
                </Tooltip>
              )}
            </div>
            {icon && (
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{ background: `${accent}14`, color: accent }}
              >
                {icon}
              </span>
            )}
          </div>
          <Statistic
            value={value ?? 0}
            precision={typeof value === 'number' && !Number.isInteger(value) ? 1 : 0}
            prefix={prefix}
            suffix={suffix}
            valueStyle={{ fontSize: 30, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}
          />
          {trend != null && (
            <div className={`mt-1 text-xs font-semibold ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(trend)}%
            </div>
          )}
        </>
      )}
    </Card>
  )
}
