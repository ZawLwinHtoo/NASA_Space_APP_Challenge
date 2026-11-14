"""Pinned Stable v1 adapter used by the approved evaluation endpoint and local CLI."""
import argparse
import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy import select

from .database import AstronautRow, CheckInRow, InventoryRow
from .schemas import CheckIn
from .member4_contract import Member4Response

STABLE_COMMIT = "2297c6af99a402a2aab354ed82eacd7335ec6b06"
EQUIPMENT = {"Blood-pressure monitor":"bp_monitor", "Digital thermometer":"thermometer", "Thermometer":"thermometer", "Pulse oximeter":"pulse_oximeter", "Weighing scale":"weighing_scale"}


class SimulationContext(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    communication_status: Literal["online", "offline"]
    emergency_override: StrictBool


class RealEngineService:
    def evaluate(self, session, check_in_id: str, context: SimulationContext, *, candidate_checks=None):
        context = SimulationContext.model_validate(context)
        # Namespaced evaluation import pins the stable engine independently of PYTHONPATH.
        from vendor.member3_stable.engine import InvestigationRequest, InventoryItem, evaluate_investigation, Rules
        row = session.get(CheckInRow, check_in_id)
        if row is None:
            raise LookupError("Check-in not found")
        if not row.synthetic:
            raise ValueError("Only saved synthetic observations are supported")
        baseline = session.get(AstronautRow, row.astronaut_id)
        if baseline is None:
            raise LookupError("Astronaut baseline not found")
        record = CheckIn.model_validate(row)
        # SQLite DateTime persists UTC without its offset; restore the stored convention.
        from datetime import timezone
        observed_at = record.recorded_at
        if observed_at.tzinfo is None:
            observed_at = observed_at.replace(tzinfo=timezone.utc)
        systolic = diastolic = None
        if record.bp is not None:
            systolic, diastolic = map(int, record.bp.split(" / "))
        snapshot = []
        ids = set()
        for item in session.scalars(select(InventoryRow).order_by(InventoryRow.name)):
            ident = EQUIPMENT.get(item.name)
            if ident is None:
                continue
            if ident in ids:
                raise ValueError("Ambiguous duplicate canonical equipment ID")
            ids.add(ident)
            snapshot.append(InventoryItem(equipment_id=ident, quantity=item.quantity, usable=item.available))
        request = InvestigationRequest.model_validate({
            "astronaut_id": record.astronaut_id, "observed_at": observed_at,
            "symptoms": record.symptoms,
            "measurements": {"resting_hr_bpm": record.hr, "sleep_hours": record.sleep, "systolic_bp_mm_hg": systolic, "diastolic_bp_mm_hg": diastolic},
            "personal_baseline": {"resting_hr_bpm": baseline.baseline, "sleep_hours": baseline.sleepBaseline},
            "available_equipment": sorted(i.equipment_id for i in snapshot if i.quantity > 0 and i.usable),
            "communication_status": context.communication_status, "emergency_override": context.emergency_override,
            "dataset_type": "synthetic",
        })
        result = evaluate_investigation(request, inventory=snapshot, candidate_checks=candidate_checks, rules=Rules(version="demo-2"))
        validated = Member4Response.model_validate(result.model_dump(mode="json"))
        if validated.next_check and not set(validated.next_check.requires_equipment) <= set(request.available_equipment):
            raise ValueError("Engine returned unavailable resources")
        if context.emergency_override and (validated.status != "escalate" or validated.next_check is not None):
            raise ValueError("Engine override invariant violated")
        return validated


if __name__ == "__main__":
    from .database import create_database
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--check-in-id", required=True)
    parser.add_argument("--communication-status", choices=["online", "offline"], required=True)
    parser.add_argument("--emergency-override", choices=["true", "false"], required=True)
    args = parser.parse_args()
    path = args.database.resolve()
    if not path.is_file():
        parser.error("Database must already exist; CLI never seeds or creates a database")
    engine, sessions = create_database(f"sqlite:///{path.as_posix()}")
    try:
        with sessions() as session:
            result = RealEngineService().evaluate(session, args.check_in_id, SimulationContext(communication_status=args.communication_status, emergency_override=args.emergency_override == "true"))
            print(result.model_dump_json(indent=2))
    finally:
        engine.dispose()
