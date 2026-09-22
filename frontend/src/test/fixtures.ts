import type { AnalysisDetail, AnalysisSummary, Finding, Health, Stats } from '../api/types'

export const findingHelmet: Finding = {
  subject: 'worker', category: 'ppe', title: 'Worker without helmet',
  description: 'One worker on the slab is not wearing a hard hat.',
  evidence: 'Left of frame, blue shirt', timestamp_seconds: 4,
  timestamp_end_seconds: null, box_2d: null,
  severity: 4, likelihood: 3, recommendation: 'Stop work until hard hats are worn.',
  required_equipment: ['hard hat'], mitigation_effectiveness: 0.8,
}

export const findingEdge: Finding = {
  subject: 'site', category: 'fall_protection', title: 'Unprotected slab edge',
  description: 'Open slab edge with no guardrail.', evidence: 'Right side, 2nd floor',
  timestamp_seconds: 7, timestamp_end_seconds: null, box_2d: null,
  severity: 5, likelihood: 5, recommendation: 'Install guardrails and toe boards.',
  required_equipment: ['guardrail system'], mitigation_effectiveness: 0.9,
}

export const findingCable: Finding = {
  subject: 'equipment', category: 'electrical', title: 'Extension cable in water',
  description: 'Power cable running through a puddle.', evidence: 'Ground floor entrance',
  timestamp_seconds: null, timestamp_end_seconds: null, box_2d: null,
  severity: 5, likelihood: 3, recommendation: 'Reroute cable overhead.',
  required_equipment: ['cable hooks'], mitigation_effectiveness: 0.7,
}

export const completedDetail: AnalysisDetail = {
  id: 'a1', created_at: '2026-09-21T10:00:00Z', site_name: 'Tower A', filename: 'clip.mov',
  media_type: 'video', mime_type: 'video/quicktime', status: 'completed',
  risk_score: 88, risk_level: 'Critical', ppe_compliance_rate: 0.75,
  error_message: null, model: 'gemini-2.5-flash', input_tokens: 3100, output_tokens: 800,
  result: {
    scene_summary: 'Two workers on a second-floor slab.',
    workers: {
      workers_visible: 2,
      ppe: [
        { item: 'helmet', compliant: 1, non_compliant: 1, notes: '' },
        { item: 'hi_vis_vest', compliant: 2, non_compliant: 0, notes: '' },
      ],
      unsafe_behaviours: ['Leaning over unprotected edge'],
    },
    positive_observations: ['Perimeter fencing present'],
    findings: [findingHelmet, findingEdge, findingCable],
  },
  scores: {
    risk_score: 88, residual_score: 16, reduction: 72, risk_level: 'Critical', residual_level: 'Low',
    findings_by_category: { ppe: 1, fall_protection: 1, electrical: 1 },
    findings_by_subject: { worker: 1, site: 1, equipment: 1 },
    ppe_compliance_rate: 0.75,
    per_finding: [
      { index: 0, risk: 12, residual_risk: 2.4 },
      { index: 1, risk: 25, residual_risk: 2.5 },
      { index: 2, risk: 15, residual_risk: 4.5 },
    ],
  },
}

export const processingDetail: AnalysisDetail = {
  ...completedDetail, id: 'p1', status: 'processing', risk_score: null, risk_level: null,
  ppe_compliance_rate: null, result: null, scores: null, model: null, input_tokens: null, output_tokens: null,
}

export const failedDetail: AnalysisDetail = {
  ...processingDetail, id: 'f1', status: 'failed', error_message: 'Gemini quota exceeded',
}

export const summaries: AnalysisSummary[] = [
  { id: 'a1', created_at: '2026-09-21T10:00:00Z', site_name: 'Tower A', filename: 'clip.mov',
    media_type: 'video', status: 'completed', risk_score: 88, risk_level: 'Critical', ppe_compliance_rate: 0.75 },
  { id: 'a2', created_at: '2026-09-20T10:00:00Z', site_name: null, filename: 'yard.png',
    media_type: 'image', status: 'completed', risk_score: 20, risk_level: 'Low', ppe_compliance_rate: 1 },
]

export const emptyStats: Stats = {
  total: 0, completed: 0, average_score: null, critical_count: 0, average_ppe_compliance: null,
  findings_by_category: {}, findings_by_subject: {}, trend: [],
}

export const stats: Stats = {
  total: 2, completed: 2, average_score: 54, critical_count: 1, average_ppe_compliance: 0.875,
  findings_by_category: { ppe: 2, fall_protection: 1, electrical: 1 }, findings_by_subject: { worker: 2, site: 1, equipment: 1 },
  trend: [{ date: '2026-09-20T10:00:00Z', score: 20 }, { date: '2026-09-21T10:00:00Z', score: 88 }],
}

export const healthOk: Health = { status: 'ok', gemini_configured: true }
