"""Reproducible package/source audit; writes backend-owned reports only."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile
from app.research import ResearchService, PACKAGE, STUDY


def audit(archive):
    backend = Path(__file__).resolve().parents[1]
    old = backend/'vendor/member4'
    report = {'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(), 'differences':{}, 'snapshot_hashes':{}}
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            if name.endswith('/') or '__pycache__' in name: continue
            relative = Path(*Path(name).parts[1:])
            data = z.read(name)
            prior = old/relative
            report['differences'][relative.as_posix()] = 'unchanged' if prior.is_file() and prior.read_bytes()==data else 'changed' if prior.is_file() else 'new'
            # Duplicate delivery ZIP is intentionally not versioned; compare its
            # source hash but require byte equality for all actual data/docs/code.
            if relative.as_posix() != 'MEDNAV_NASA_OSD575_Handoff.zip' and (PACKAGE/relative).read_bytes()!=data:
                raise ValueError('Snapshot differs from ZIP')
            report['snapshot_hashes'][relative.as_posix()] = hashlib.sha256(data).hexdigest()
    report['validation'] = ResearchService().validation
    with zipfile.ZipFile(STUDY/'raw/OSD-575_metadata_OSD-575-ISA.zip') as metadata:
        report['metadata_members'] = metadata.namelist()
        report['metadata_corrupt_member'] = metadata.testzip()
    db = backend/'mednav.db'
    report['development_db_sha256'] = hashlib.sha256(db.read_bytes()).hexdigest() if db.exists() else None
    out = backend/'qa_results/osd575'
    out.mkdir(parents=True, exist_ok=True)
    (out/'source_audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report['validation'],indent=2))


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('archive',type=Path)
    audit(parser.parse_args().archive)
