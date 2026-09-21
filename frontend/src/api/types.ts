export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type MediaType = 'image' | 'video'
export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical'
export type FindingSubject = 'worker' | 'site' | 'equipment'
export type RiskCategory =
  | 'fall_protection' | 'ppe' | 'scaffolding' | 'electrical' | 'excavation' | 'struck_by'
  | 'housekeeping' | 'machinery' | 'fire' | 'structural' | 'other'
export type PpeItem = 'helmet' | 'hi_vis_vest' | 'harness' | 'gloves' | 'safety_boots' | 'eye_protection'

export interface PpeCheck {
  item: PpeItem
  compliant: number
  non_compliant: number
  notes: string
}

export interface WorkerAssessment {
  workers_visible: number
  ppe: PpeCheck[]
  unsafe_behaviours: string[]
}

export interface Finding {
  subject: FindingSubject
  category: RiskCategory
  title: string
  description: string
  evidence: string
  timestamp_seconds: number | null
  severity: number
  likelihood: number
  recommendation: string
  required_equipment: string[]
  mitigation_effectiveness: number
}

export interface AnalysisResult {
  scene_summary: string
  workers: WorkerAssessment
  positive_observations: string[]
  findings: Finding[]
}

export interface FindingScore {
  index: number
  risk: number
  residual_risk: number
}

export interface ScoreSummary {
  risk_score: number
  residual_score: number
  reduction: number
  risk_level: RiskLevel
  residual_level: RiskLevel
  findings_by_category: Partial<Record<RiskCategory, number>>
  findings_by_subject: Partial<Record<FindingSubject, number>>
  ppe_compliance_rate: number | null
  per_finding: FindingScore[]
}

export interface AnalysisSummary {
  id: string
  created_at: string
  site_name: string | null
  filename: string
  media_type: MediaType
  status: AnalysisStatus
  risk_score: number | null
  risk_level: RiskLevel | null
  ppe_compliance_rate: number | null
}

export interface AnalysisDetail extends AnalysisSummary {
  mime_type: string
  error_message: string | null
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  result: AnalysisResult | null
  scores: ScoreSummary | null
}

export interface TrendPoint {
  date: string
  score: number
}

export interface Stats {
  total: number
  completed: number
  average_score: number | null
  critical_count: number
  average_ppe_compliance: number | null
  findings_by_category: Partial<Record<RiskCategory, number>>
  findings_by_subject: Partial<Record<FindingSubject, number>>
  trend: TrendPoint[]
}

export interface Health {
  status: string
  gemini_configured: boolean
}

export interface Created {
  id: string
  status: AnalysisStatus
}
