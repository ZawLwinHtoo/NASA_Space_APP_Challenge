"""Backend-owned saved-record adapter for an opt-in isolated engine trial only."""
from pydantic import BaseModel, ConfigDict, StrictBool
from engine import InvestigationRequest, InventoryItem, evaluate_investigation
from engine.rules import Rules
from app.member4_contract import Member4Response

EQUIPMENT = {"Blood-pressure monitor": "bp_monitor", "Digital thermometer": "thermometer", "Thermometer": "thermometer", "Pulse oximeter": "pulse_oximeter", "Weighing scale": "weighing_scale"}


class ScenarioContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Required explicitly: these are not persisted by the current backend.
    communication_status: str
    emergency_override: StrictBool


def evaluate_saved(check_in, profile, inventory, context: ScenarioContext, *, candidate_checks=None):
    if context.communication_status not in ("online", "offline"):
        raise ValueError("Explicit online/offline communication state required")
    if not check_in.synthetic:
        raise ValueError("Only synthetic saved records may enter this trial")
    if check_in.astronaut_id != profile.id:
        raise ValueError("Profile and check-in IDs differ")
    systolic = diastolic = None
    if check_in.bp is not None:
        import re
        if not re.fullmatch(r"[1-9][0-9]{0,3} / [1-9][0-9]{0,3}", check_in.bp):
            raise ValueError("Unrecognized BP representation")
        systolic, diastolic = map(int, check_in.bp.split(" / "))
    snapshot = []
    for item in inventory:
        if item.name not in EQUIPMENT:
            continue  # Unmapped resources are not silently declared engine-compatible.
        snapshot.append(InventoryItem(equipment_id=EQUIPMENT[item.name], quantity=item.quantity, usable=item.available))
    request = InvestigationRequest.model_validate({
        "astronaut_id": check_in.astronaut_id,
        "observed_at": check_in.recorded_at,
        "symptoms": check_in.symptoms,
        "measurements": {"resting_hr_bpm": check_in.hr, "sleep_hours": check_in.sleep, "systolic_bp_mm_hg": systolic, "diastolic_bp_mm_hg": diastolic},
        "personal_baseline": {"resting_hr_bpm": profile.baseline, "sleep_hours": profile.sleepBaseline},
        "available_equipment": sorted(i.equipment_id for i in snapshot if i.quantity > 0 and i.usable),
        "communication_status": context.communication_status,
        "emergency_override": context.emergency_override,
        "dataset_type": "synthetic",
    })
    result = evaluate_investigation(request, inventory=snapshot, candidate_checks=candidate_checks, rules=Rules(version="demo-2"))
    validated = Member4Response.model_validate(result.model_dump(mode="json"))
    return request, validated
