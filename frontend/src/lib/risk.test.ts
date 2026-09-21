import { describe, expect, it } from 'vitest'
import type { RiskCategory, PpeItem } from '../api/types'
import { CATEGORY_LABELS, LEVELS, PPE_LABELS, SUBJECT_META, levelFor, riskBand } from './risk'

describe('levelFor', () => {
  it.each([
    [0, 'Low'], [24, 'Low'], [25, 'Moderate'], [49, 'Moderate'],
    [50, 'High'], [74, 'High'], [75, 'Critical'], [100, 'Critical'],
  ])('%i -> %s', (score, level) => {
    expect(levelFor(score)).toBe(level)
  })
})

describe('metadata tables', () => {
  it('every level has label, icon and classes', () => {
    for (const meta of Object.values(LEVELS)) {
      expect(meta.label).toBeTruthy()
      expect(meta.icon).toBeTruthy()
      expect(meta.text).toMatch(/^text-risk-/)
    }
  })

  it('labels exist for all categories, subjects and PPE items', () => {
    const categories: RiskCategory[] = ['fall_protection', 'ppe', 'scaffolding', 'electrical', 'excavation',
      'struck_by', 'housekeeping', 'machinery', 'fire', 'structural', 'other']
    categories.forEach((c) => expect(CATEGORY_LABELS[c]).toBeTruthy())
    expect(Object.keys(SUBJECT_META)).toEqual(['worker', 'site', 'equipment'])
    const ppe: PpeItem[] = ['helmet', 'hi_vis_vest', 'harness', 'gloves', 'safety_boots', 'eye_protection']
    ppe.forEach((p) => expect(PPE_LABELS[p]).toBeTruthy())
  })
})

describe('riskBand', () => {
  it('maps severity x likelihood product to a level', () => {
    expect(riskBand(1)).toBe('Low')
    expect(riskBand(6)).toBe('Low')
    expect(riskBand(8)).toBe('Moderate')
    expect(riskBand(12)).toBe('Moderate')
    expect(riskBand(15)).toBe('High')
    expect(riskBand(16)).toBe('High')
    expect(riskBand(20)).toBe('Critical')
    expect(riskBand(25)).toBe('Critical')
  })
})
