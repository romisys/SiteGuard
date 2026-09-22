import {
  AlertTriangle, Building2, HardHat, OctagonAlert, ShieldAlert, ShieldCheck, Wrench, type LucideIcon,
} from 'lucide-react'
import type { FindingSubject, PpeItem, RiskCategory, RiskLevel } from '../api/types'

export interface LevelMeta {
  label: RiskLevel
  icon: LucideIcon
  /** text color utility */
  text: string
  /** soft background utility */
  bg: string
  /** solid fill utility (bars, gauge) */
  fill: string
  /** border utility (hazard boxes over stills and footage) */
  border: string
  /** raw CSS var for SVG/recharts */
  cssVar: string
}

export const LEVELS: Record<RiskLevel, LevelMeta> = {
  Low: { label: 'Low', icon: ShieldCheck, text: 'text-risk-low', bg: 'bg-risk-low/10', fill: 'bg-risk-low', border: 'border-risk-low', cssVar: 'var(--color-risk-low)' },
  Moderate: { label: 'Moderate', icon: AlertTriangle, text: 'text-risk-moderate', bg: 'bg-risk-moderate/10', fill: 'bg-risk-moderate', border: 'border-risk-moderate', cssVar: 'var(--color-risk-moderate)' },
  High: { label: 'High', icon: ShieldAlert, text: 'text-risk-high', bg: 'bg-risk-high/10', fill: 'bg-risk-high', border: 'border-risk-high', cssVar: 'var(--color-risk-high)' },
  Critical: { label: 'Critical', icon: OctagonAlert, text: 'text-risk-critical', bg: 'bg-risk-critical/10', fill: 'bg-risk-critical', border: 'border-risk-critical', cssVar: 'var(--color-risk-critical)' },
}

/** Same thresholds as backend scoring.level_for. */
export function levelFor(score: number): RiskLevel {
  if (score >= 75) return 'Critical'
  if (score >= 50) return 'High'
  if (score >= 25) return 'Moderate'
  return 'Low'
}

/** Band for a single finding's severity x likelihood (1..25). Used by the matrix and cards. */
export function riskBand(product: number): RiskLevel {
  if (product >= 20) return 'Critical'
  if (product >= 15) return 'High'
  if (product >= 8) return 'Moderate'
  return 'Low'
}

export const CATEGORY_LABELS: Record<RiskCategory, string> = {
  fall_protection: 'Fall protection',
  ppe: 'PPE',
  scaffolding: 'Scaffolding',
  electrical: 'Electrical',
  excavation: 'Excavation',
  struck_by: 'Struck-by',
  housekeeping: 'Housekeeping',
  machinery: 'Machinery',
  fire: 'Fire',
  structural: 'Structural',
  other: 'Other',
}

export const SUBJECT_META: Record<FindingSubject, { label: string; icon: LucideIcon }> = {
  worker: { label: 'Worker', icon: HardHat },
  site: { label: 'Site', icon: Building2 },
  equipment: { label: 'Equipment', icon: Wrench },
}

export const PPE_LABELS: Record<PpeItem, string> = {
  helmet: 'Helmet',
  hi_vis_vest: 'Hi-vis vest',
  harness: 'Harness',
  gloves: 'Gloves',
  safety_boots: 'Safety boots',
  eye_protection: 'Eye protection',
}
