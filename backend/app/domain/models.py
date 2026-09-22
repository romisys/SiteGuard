"""Pure domain models. This is the JSON contract Gemini must satisfy.

No FastAPI, SQLAlchemy or google-genai imports here.
"""

from enum import StrEnum

from pydantic import BaseModel, Field, field_validator


class RiskCategory(StrEnum):
    fall_protection = "fall_protection"
    ppe = "ppe"
    scaffolding = "scaffolding"
    electrical = "electrical"
    excavation = "excavation"
    struck_by = "struck_by"
    housekeeping = "housekeeping"
    machinery = "machinery"
    fire = "fire"
    structural = "structural"
    other = "other"


class FindingSubject(StrEnum):
    worker = "worker"
    site = "site"
    equipment = "equipment"


class PpeItem(StrEnum):
    helmet = "helmet"
    hi_vis_vest = "hi_vis_vest"
    harness = "harness"
    gloves = "gloves"
    safety_boots = "safety_boots"
    eye_protection = "eye_protection"


class RiskLevel(StrEnum):
    low = "Low"
    moderate = "Moderate"
    high = "High"
    critical = "Critical"


class MediaType(StrEnum):
    image = "image"
    video = "video"


class AnalysisStatus(StrEnum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class PpeCheck(BaseModel):
    item: PpeItem
    compliant: int = Field(ge=0, description="Workers wearing this item")
    non_compliant: int = Field(ge=0, description="Workers who should wear it but do not")
    notes: str = ""


class WorkerAssessment(BaseModel):
    workers_visible: int = Field(ge=0)
    ppe: list[PpeCheck] = Field(default_factory=list)
    unsafe_behaviours: list[str] = Field(default_factory=list)


class Finding(BaseModel):
    subject: FindingSubject
    category: RiskCategory
    title: str
    description: str = Field(description="What was observed")
    evidence: str = Field(description="Where in the frame / when it was seen")
    timestamp_seconds: float | None = Field(default=None, description="Video only")
    timestamp_end_seconds: float | None = Field(
        default=None, description="Video only: when the hazard stops being visible"
    )
    box_2d: list[int] | None = Field(
        default=None,
        description=(
            "Bounding box around the hazard at timestamp_seconds, as "
            "[y_min, x_min, y_max, x_max] normalised to 0-1000"
        ),
    )
    severity: int = Field(
        ge=1, le=5, description="Consequence if it happens, 1 first aid .. 5 fatality"
    )
    likelihood: int = Field(
        ge=1, le=5, description="Probability given what is visible, 1 rare .. 5 almost certain"
    )
    recommendation: str
    required_equipment: list[str] = Field(default_factory=list)
    mitigation_effectiveness: float = Field(
        ge=0, le=1, description="Fraction of this risk removed if the recommendation is applied"
    )

    @field_validator("box_2d", mode="after")
    @classmethod
    def _drop_malformed_box(cls, value: list[int] | None) -> list[int] | None:
        """A box we cannot draw is worth losing; the finding itself is not."""
        if value is None:
            return None
        if len(value) != 4 or not all(0 <= v <= 1000 for v in value):
            return None
        y_min, x_min, y_max, x_max = value
        if y_min >= y_max or x_min >= x_max:
            return None
        return value

    @property
    def risk(self) -> int:
        return self.severity * self.likelihood


class AnalysisResult(BaseModel):
    scene_summary: str
    workers: WorkerAssessment
    positive_observations: list[str] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
