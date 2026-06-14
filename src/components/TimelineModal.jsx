import React from 'react'
import { Modal, Timeline, Tag, Spin, Empty, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { metricsAPI } from '../api/metrics'
import { hours } from '../utils/format'

// Per-deal drill-down (queries 7.10 + 7.14): the full stage-by-stage journey of
// one opportunity, with time-in-stage and message counts per stage. Opened by
// clicking an opportunity row in any "Show data" table.
export default function TimelineModal({ opportunityId, name, open, onClose }) {
  const q = useQuery({
    queryKey: ['timeline', opportunityId],
    queryFn: () => metricsAPI.opportunityTimeline(opportunityId),
    enabled: open && !!opportunityId,
  })
  const rows = q.data?.data || []

  return (
    <Modal
      title={<span>Deal journey {name ? <span className="text-gray-400 font-normal">· {name}</span> : null}</span>}
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
    >
      {q.isLoading ? (
        <div className="py-10 flex justify-center"><Spin /></div>
      ) : !rows.length ? (
        <Empty description="No stage history for this opportunity" />
      ) : (
        <Timeline
          className="mt-2"
          items={rows.map((r) => ({
            color: r.current_stage ? 'blue' : r.ghost_opportunity ? 'gray' : 'green',
            children: (
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800">{r.stage_name || 'Unknown'}</span>
                  {r.current_stage && <Tag color="blue">Current</Tag>}
                  {r.ghost_opportunity && (
                    <Tooltip title="Synthesized by the daily sweep — never observed via a real stage webhook">
                      <Tag>auto</Tag>
                    </Tooltip>
                  )}
                  {r.triggered_by && <Tag bordered={false} className="!bg-gray-50 !text-gray-500">{r.triggered_by}</Tag>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {dayjs(r.entered_at).format('DD MMM YY, HH:mm')}
                  {r.left_at ? ` → ${dayjs(r.left_at).format('DD MMM YY, HH:mm')}` : ' → now'}
                  {r.hours_in_stage != null && <> · {hours(r.hours_in_stage)} in stage</>}
                  {' · '}{r.messages} message{r.messages === 1 ? '' : 's'}
                </div>
              </div>
            ),
          }))}
        />
      )}
    </Modal>
  )
}
