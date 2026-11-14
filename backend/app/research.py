"""Read-only OSD-575 display service. No database, routes or engine imports."""
import csv
import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, StrictBool, StrictFloat, StrictInt, model_validator

TIMEPOINTS = ("L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194")
CREWS = ("C001", "C002", "C003", "C004")
SOURCE = "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575"
PACKAGE = Path(__file__).resolve().parents[1] / "vendor/member4_osd575/MEDNAV_Member4_Data_QA_Package"
STUDY = PACKAGE / "data/nasa/OSD-575"
Numeric = StrictFloat | StrictInt | None


class FrozenModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class Measurement(FrozenModel):
    metric: str
    unit_from_source_header: str | None
    value: Numeric
    missing: StrictBool
    source_value_text: str
    source_column: str
    reference_min: Numeric
    reference_max: Numeric
    source_reference_min_text: str
    source_reference_max_text: str

    @model_validator(mode="after")
    def missing_consistent(self):
        if self.missing != (self.value is None):
            raise ValueError("Missing flag must match null value")
        return self


class Sample(FrozenModel):
    sample_id: str
    crew_id: Literal["C001", "C002", "C003", "C004"]
    material: Literal["serum"]
    timepoint: Literal["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"]
    phase: Literal["pre_flight", "post_flight"]
    time_anchor: Literal["launch", "return"]
    day_offset: StrictInt
    measurements: tuple[Measurement, ...]

    @model_validator(mode="after")
    def identifiers(self):
        if self.sample_id != f"{self.crew_id}_serum_{self.timepoint}":
            raise ValueError("Sample identifier mismatch")
        pre = self.timepoint.startswith("L")
        if (self.phase, self.time_anchor, self.day_offset) != ("pre_flight" if pre else "post_flight", "launch" if pre else "return", int(self.timepoint[1:])):
            raise ValueError("Timepoint/anchor mismatch")
        if len(self.measurements) != 19 or len({m.metric for m in self.measurements}) != 19:
            raise ValueError("Exactly 19 unique measurement fields required")
        return self


class ResearchDataset(FrozenModel):
    schema_version: Literal["mednav-lab-draft-1"]
    dataset_type: Literal["real_nasa_osdr"]
    study_id: Literal["OSD-575"]
    source_url: Literal["https://osdr.nasa.gov/bio/repo/data/studies/OSD-575"]
    source_file: Literal["LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv"]
    purpose: str
    samples: tuple[Sample, ...]

    @model_validator(mode="after")
    def coverage(self):
        if len(self.samples) != 28 or len({s.sample_id for s in self.samples}) != 28:
            raise ValueError("Expected 28 unique research samples")
        for crew in CREWS:
            if {s.timepoint for s in self.samples if s.crew_id == crew} != set(TIMEPOINTS):
                raise ValueError("Expected seven actual sampling timepoints per crew")
        if len({frozenset(m.metric for m in s.measurements) for s in self.samples}) != 1:
            raise ValueError("Measurement catalog differs between samples")
        return self


def numeric(text):
    return None if text in ("", "NA", "N/A") else float(text)


# Source analyte names are retained; no inferred diagnostic semantics.
ANALYTES = dict(zip(
    ("albumin", "albumin_to_globulin_ratio", "alkaline_phosphatase", "alt", "ast", "total_bilirubin", "bun_to_creatinine_ratio", "calcium", "carbon_dioxide", "chloride", "creatinine", "egfr_african_american", "egfr_non_african_american", "globulin", "glucose", "potassium", "total_protein", "sodium", "urea_nitrogen_bun"),
    ("ALBUMIN", "ALBUMIN/GLOBULIN RATIO", "ALKALINE PHOSPHATASE", "ALT", "AST", "BILIRUBIN; TOTAL", "BUN/CREATININE RATIO", "CALCIUM", "CARBON DIOXIDE", "CHLORIDE", "CREATININE", "eGFR AFRICAN AMERICAN", "eGFR NON-AFR. AMERICAN", "GLOBULIN", "GLUCOSE", "POTASSIUM", "PROTEIN; TOTAL", "SODIUM", "UREA NITROGEN (BUN)")
))
UNITS = {"gram_per_deciliter": "g/dL", "milligram_per_deciliter": "mg/dL", "millimol_per_liter": "mmol/L", "units_per_liter": "U/L", "milliliter_per_minute_per_1.73_meter_squared": "mL/min/1.73m2", None: "(calc)"}


def csv_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def validate_sources(dataset, study=STUDY):
    """Compare every value, unit and bound to BOTH delivered CSV representations."""
    transformed = csv_rows(study / "raw" / dataset.source_file)
    submitted = csv_rows(study / "raw/LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv")
    keyed = {r["Sample Name"]: r for r in transformed}
    original = {(r["SUBJECT_ID"], r["timepoint"], r["ANALYTE"]): r for r in submitted}
    if len(keyed) != 28 or len(transformed) != 28 or len(original) != len(submitted):
        raise ValueError("Source CSV sample/analyte duplicates or coverage mismatch")
    if set(keyed) != {s.sample_id for s in dataset.samples}:
        raise ValueError("CSV and JSON sample IDs differ")
    submitted_missing = []
    for sample in dataset.samples:
        row = keyed[sample.sample_id]
        if {m.source_column for m in sample.measurements} != {k for k in row if "_value" in k}:
            raise ValueError("CSV measurement catalog mismatch")
        for m in sample.measurements:
            expected_column = m.metric + "_value" + ("_" + m.unit_from_source_header if m.unit_from_source_header else "")
            if m.source_column != expected_column:
                raise ValueError("Unit/source column mismatch")
            lower = m.source_column.replace("_value", "_range_min", 1)
            upper = m.source_column.replace("_value", "_range_max", 1)
            if upper not in row:  # Original ALT/AST columns use _max rather than _range_max.
                upper = m.source_column.replace("_value", "_max", 1)
            src = original.get((sample.crew_id, sample.timepoint, ANALYTES[m.metric]))
            if src is None:
                submitted_missing.append(f"{sample.sample_id}/{m.metric}")
            for text, val, column, raw_column in ((m.source_value_text, m.value, m.source_column, "VALUE"), (m.source_reference_min_text, m.reference_min, lower, "RANGE_MIN"), (m.source_reference_max_text, m.reference_max, upper, "RANGE_MAX")):
                if text != row[column] or (src is not None and text != src[raw_column]) or val != numeric(text):
                    raise ValueError(f"CSV conversion mismatch: {sample.sample_id}/{m.metric}/{column}")
            if src is not None and src["UNITS"] != UNITS[m.unit_from_source_header]:
                raise ValueError("Submitted CSV unit mismatch")
    values = [m.value for s in dataset.samples for m in s.measurements]
    return {"samples": len(dataset.samples), "crews": list(CREWS), "timepoints": list(TIMEPOINTS), "measurement_slots": len(values), "numeric_values": sum(v is not None for v in values), "null_values": sum(v is None for v in values), "transformed_slots_verified": len(values), "submitted_rows_verified": len(submitted), "submitted_missing": submitted_missing, "source_url": dataset.source_url}


class ResearchService:
    def __init__(self, study: Path = STUDY):
        self.dataset = ResearchDataset.model_validate_json((study / "processed/nasa_lab_results.json").read_text(encoding="utf-8-sig"))
        self.validation = validate_sources(self.dataset, study)

    def select(self, *, crew: str, metric: str, timepoint: str | None = None):
        if crew not in CREWS or metric not in ANALYTES or (timepoint is not None and timepoint not in TIMEPOINTS):
            raise ValueError("Unknown research crew, metric or sampling timepoint")
        samples = sorted((s for s in self.dataset.samples if s.crew_id == crew and (timepoint is None or s.timepoint == timepoint)), key=lambda s: TIMEPOINTS.index(s.timepoint))
        return tuple((s, next(m for m in s.measurements if m.metric == metric)) for s in samples)
