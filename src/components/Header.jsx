import React from 'react'
import { Tag } from 'antd'
import { ThunderboltFilled } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'

export default function Header() {
  const { location, ghlContext } = useAuth()
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center">
          <ThunderboltFilled className="text-white text-lg" />
        </div>
        <div>
          <div className="font-bold text-gray-900 leading-tight">PipelinePulse</div>
          <div className="text-[11px] text-gray-400 leading-tight">Pipeline analytics</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {ghlContext?.userName && (
          <span className="text-sm text-gray-500 hidden sm:inline">{ghlContext.userName}</span>
        )}
        <Tag color="blue">{location?.id ? `Location ${location.id.slice(0, 8)}…` : 'Sub-account'}</Tag>
      </div>
    </header>
  )
}
