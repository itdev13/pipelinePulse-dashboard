import React, { useEffect, useState } from 'react'
import { controlAPI } from '../../api/control'
import ToneOfVoiceSection from '../control/ToneOfVoiceSection'
import MeddicMappingSection from '../control/MeddicMappingSection'
import ProductKnowledgeSection from '../control/ProductKnowledgeSection'
import BusinessInfoSection from '../control/BusinessInfoSection'

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
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
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
