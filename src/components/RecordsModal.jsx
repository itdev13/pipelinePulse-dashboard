import React from 'react'
import { Modal, Table, Empty } from 'antd'
import { useQuery } from '@tanstack/react-query'

// Generic "Show data" drawer — fetches the raw rows behind a chart and renders
// them in a table. `queryKey` makes each modal's fetch independently cached;
// `fetchFn` returns the API promise; `columns` is an antd column config.
export default function RecordsModal({ open, onClose, title, queryKey, fetchFn, columns, rowKey }) {
  const q = useQuery({
    queryKey,
    queryFn: fetchFn,
    enabled: open, // only fetch when opened
  })
  const rows = q.data?.data || []

  return (
    <Modal title={title} open={open} onCancel={onClose} footer={null} width={1000}>
      <Table
        size="small"
        loading={q.isLoading}
        dataSource={rows}
        columns={columns}
        rowKey={rowKey || ((_, i) => i)}
        pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (t) => `${t} record${t === 1 ? '' : 's'}` }}
        locale={{ emptyText: <Empty description="No matching records" /> }}
        scroll={{ x: true }}
      />
    </Modal>
  )
}
