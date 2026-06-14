import React, { useState, useMemo } from 'react'
import { Modal, Table, Empty, Input, Select, Space, Button } from 'antd'
import { SearchOutlined, ClearOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'

// Generic "Show data" viewer — fetches the raw rows behind a chart and renders
// them in a filterable table.
//
//  - queryKey / fetchFn: the records fetch (cached, only runs when open)
//  - columns: antd column config
//  - filters: optional array of filter controls to render above the table:
//      { key, label, type: 'select'|'search', options?, dataIndex }
//    'select' filters the rows client-side by exact match on dataIndex;
//    'search' does a case-insensitive substring match on dataIndex.
export default function RecordsModal({
  open, onClose, title, queryKey, fetchFn, columns, rowKey, filters = [],
}) {
  const q = useQuery({ queryKey, queryFn: fetchFn, enabled: open })
  const allRows = q.data?.data || []

  const [filterState, setFilterState] = useState({})
  const setF = (k, v) => setFilterState((s) => ({ ...s, [k]: v }))
  const clearAll = () => setFilterState({})

  // Apply client-side filters over the fetched rows.
  const rows = useMemo(() => {
    return allRows.filter((row) =>
      filters.every((f) => {
        const val = filterState[f.key]
        if (val == null || val === '') return true
        const cell = row[f.dataIndex]
        if (f.type === 'search') {
          return String(cell ?? '').toLowerCase().includes(String(val).toLowerCase())
        }
        return String(cell ?? '') === String(val)
      })
    )
  }, [allRows, filterState, filters])

  // Build select options dynamically from the data when not explicitly given.
  const optionsFor = (f) => {
    if (f.options) return f.options
    const seen = [...new Set(allRows.map((r) => r[f.dataIndex]).filter((v) => v != null && v !== ''))]
    return seen.map((v) => ({ label: String(v), value: v }))
  }

  const hasActiveFilter = Object.values(filterState).some((v) => v != null && v !== '')

  return (
    <Modal title={title} open={open} onCancel={onClose} footer={null} width={1040}>
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {filters.map((f) =>
            f.type === 'search' ? (
              <Input
                key={f.key}
                allowClear
                size="small"
                style={{ width: 220 }}
                prefix={<SearchOutlined className="text-gray-400" />}
                placeholder={f.label}
                value={filterState[f.key] || ''}
                onChange={(e) => setF(f.key, e.target.value)}
              />
            ) : (
              <Select
                key={f.key}
                allowClear
                size="small"
                style={{ minWidth: 150 }}
                placeholder={f.label}
                value={filterState[f.key]}
                onChange={(v) => setF(f.key, v)}
                options={optionsFor(f)}
              />
            )
          )}
          {hasActiveFilter && (
            <Button size="small" type="text" icon={<ClearOutlined />} onClick={clearAll}>
              Clear
            </Button>
          )}
        </div>
      )}
      <Table
        size="small"
        loading={q.isLoading}
        dataSource={rows}
        columns={columns}
        rowKey={rowKey || ((_, i) => i)}
        pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (t) => `${t} record${t === 1 ? '' : 's'}` }}
        locale={{ emptyText: <Empty description={q.isLoading ? 'Loading…' : 'No matching records'} /> }}
        scroll={{ x: true }}
      />
    </Modal>
  )
}
