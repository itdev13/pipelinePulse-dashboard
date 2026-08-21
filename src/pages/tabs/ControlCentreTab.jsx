import React, { useEffect, useState } from 'react'
import { controlAPI } from '../../api/control'
import ToneOfVoiceSection from '../control/ToneOfVoiceSection'
import MeddicMappingSection from '../control/MeddicMappingSection'
import ProductKnowledgeSection from '../control/ProductKnowledgeSection'
import BusinessInfoSection from '../control/BusinessInfoSection'
import { Bar, SkeletonStyles } from '../shared/ListChrome'

// Control centre — everything a location teaches the AI about itself.
//
// One GET loads the page; each section saves independently so editing the
// MEDDIC form can't clobber a product row. Sections own their own draft
// state and dirty/saving indicators — this tab just holds the fetched
// server state and hands each section its slice plus a save callback.
//
// Section accents come from the design: Tone = sky, MEDDIC = gold,
// Products = pine, Business = plum.

export default function ControlCentreTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    controlAPI.get()
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err.message || 'Failed to load control centre'))
    return () => { alive = false }
  }, [])

  if (error) {
    return (
      <Shell>
        <div
          style={{
            padding: 16,
            border: '1px solid var(--border-default)',
            borderLeft: '3px solid var(--status-stuck)',
            borderRadius: 'var(--radius-md)',
            background: '#fff',
            fontSize: 13, color: 'var(--text-body)'
          }}
        >
          {error}
        </div>
      </Shell>
    )
  }

  if (!data) {
    return (
      <Shell>
        <SkeletonStyles />
        {/* One block per section, in the real order, so the page keeps its
            height while the config loads. */}
        {[200, 260, 200, 170].map((h, i) => (
          <div
            key={i}
            style={{
              border: '2px solid var(--gray-200)',
              borderRadius: 'var(--radius-md)',
              background: '#fff', overflow: 'hidden'
            }}
          >
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '12px 16px'
              }}
            >
              <Bar w={20} h={20} style={{ flex: 'none' }} />
              <Bar w={i % 2 ? 168 : 132} h={15} />
              <span style={{ marginLeft: 'auto' }}><Bar w={72} h={11} /></span>
            </div>
            <div
              style={{
                padding: '10px 16px',
                borderTop: '1px solid var(--border-default)',
                borderBottom: '1px solid var(--border-default)',
                background: 'var(--gray-50)'
              }}
            >
              <Bar w="72%" h={11} />
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <Bar w="100%" h={h / 4} r="var(--radius-md)" />
              <Bar w="86%" h={14} />
              <Bar w="64%" h={14} />
            </div>
          </div>
        ))}
      </Shell>
    )
  }

  return (
    <Shell>
      <ToneOfVoiceSection
        samples={data.toneSamples}
        onAdd={async (sample) => {
          const created = await controlAPI.addToneSample(sample)
          setData((d) => ({ ...d, toneSamples: [created, ...d.toneSamples] }))
        }}
        onDelete={async (id) => {
          await controlAPI.deleteToneSample(id)
          setData((d) => ({
            ...d,
            toneSamples: d.toneSamples.filter((s) => s.id !== id)
          }))
        }}
      />

      <MeddicMappingSection
        meddic={data.meddic}
        fields={data.meddicFields || []}
        onSave={async (meddic) => {
          const res = await controlAPI.saveMeddic(meddic)
          setData((d) => ({ ...d, meddic: res.meddic }))
        }}
      />

      <ProductKnowledgeSection
        products={data.products}
        onSave={async (products) => {
          const res = await controlAPI.saveProducts(products)
          setData((d) => ({ ...d, products: res.products }))
        }}
      />

      <BusinessInfoSection
        businessInfo={data.businessInfo}
        onSave={async (businessInfo) => {
          const res = await controlAPI.saveBusinessInfo(businessInfo)
          setData((d) => ({ ...d, businessInfo: res.businessInfo }))
        }}
      />
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '4px 20px 48px' }}>
      <div
        style={{
          display: 'flex', alignItems: 'baseline', gap: 14,
          flexWrap: 'wrap', marginBottom: 18
        }}
      >
        <h1 style={{ fontSize: 25, fontWeight: 600, margin: 0 }}>Control centre</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Teach the AI your voice, your language and your products — everything
          here shapes its summaries and drafts
        </p>
      </div>
      <div style={{ display: 'grid', gap: 18 }}>{children}</div>
    </div>
  )
}
