import React from 'react'
import { Spin, Result, Button } from 'antd'

export function LoadingScreen({ message = 'Connecting to your sub-account…' }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <Spin size="large" />
      <div className="text-gray-500">{message}</div>
    </div>
  )
}

export function ErrorScreen({ error }) {
  const notConnected = /not connected|install|NOT_CONNECTED/i.test(String(error))
  return (
    <div className="h-full flex items-center justify-center p-6">
      <Result
        status={notConnected ? 'warning' : 'error'}
        title={notConnected ? 'App not connected' : 'Something went wrong'}
        subTitle={String(error)}
        extra={
          <Button type="primary" onClick={() => window.location.reload()}>
            Retry
          </Button>
        }
      />
    </div>
  )
}
