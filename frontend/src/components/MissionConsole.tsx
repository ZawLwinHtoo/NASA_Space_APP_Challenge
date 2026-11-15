import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ArrowLeft,
  FileText,
  HeartPulse,
  Stethoscope,
  Moon,
  Activity,
  ShieldCheck,
  Radiation,
  Dumbbell,
  Eye,
  Download,
  ScanLine,
  Database,
  Info,
  UserRound,
  ClipboardList,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
} from 'recharts';
import { history as fixtureHistory, type Crew, type Equipment } from '../data/fixtures';
import { getScenario } from '../data/scenarios';
import {
  formatInvestigationView,
  type ScenarioResponse,
} from '../types/scenario';
import {
  partInfo,
  type AnatomyLayerMode,
  type AnatomyModelStatus,
  type AnatomySex,
} from '../data/anatomy';
import { BodyViewer } from './BodyViewer';
import type { InvestigationResponse } from '../voice/types';
import { asVoiceResponse } from '../voice/currentDemo';
import { BodySystemMonitoring } from './BodySystemMonitoring';
import { MissionHealthTimeline } from './MissionHealthTimeline';
import { bodyRegion } from '../data/bodyMonitoring';
import { BODY_SYSTEMS, replayWindow } from '../data/bodyGraph';
import { BodyGraphNavigator } from './BodyGraphNavigator';
import type { SavedCheckIn } from '../types/api';
import '../console.css';

type Props = {
  live?: boolean;
  liveResponse?: ScenarioResponse | null;
  liveHistory?: Record<string,unknown>[];
  liveRecord?:SavedCheckIn|null;
  liveRecords?:SavedCheckIn[];
  historyLoading?:boolean;
  historyError?:string;
  lastSyncedAt?:string;
  onRefresh?:()=>void;
  refreshing?:boolean;
  onInvestigate?:(id?:string)=>void;
  crew: Crew;
  profiles: Crew[];
  onSelectCrew: (id: string) => void;
  inventory: Equipment[];
  flags: boolean[];
  setFlags: (f: boolean[]) => void;
  page: number;
  go: (p: number) => void;
  voiceResponse: InvestigationResponse | null;
};

const evidence = {
  readings: {
    title: 'Recorded observations',
    text: 'HR, sleep, radiation, and exercise vs. baseline.',
    links: ['known', 'next'],
  },
  bp: {
    title: 'Missing measurements',
    text: 'Unmeasured values stay Unknown.',
    links: ['unknown', 'resource', 'next'],
  },
  resources: {
    title: 'Equipment dependency',
    text: 'Unavailable equipment blocks dependent checks only.',
    links: ['resource', 'next'],
  },
  next: {
    title: 'Next step selection',
    text: 'Returned by the prototype catalog and rules. Not a clinically validated mission checklist.',
    links: ['known', 'unknown', 'resource', 'next'],
  },
};

function waveformPoints(base = 0, pulse = false) {
  const n = 64;
  return Array.from({ length: n }, (_, i) => {
    const x = (i / (n - 1)) * 180;
    let y = 20 + Math.sin(i * 0.35 + base) * 2.5 + Math.sin(i * 0.09) * 1.5;
    if (pulse) {
      const phase = (i + base) % 22;
      y += phase === 11 ? -15 : phase === 10 || phase === 12 ? 7 : 0;
    }
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function MiniWave({
  tone = 'cobalt',
  pulse = false,
  seed = 0,
}: {
  tone?: 'cobalt' | 'amber' | 'coral';
  pulse?: boolean;
  seed?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`miniwave wave-${tone}`}
      viewBox="0 0 180 42"
      preserveAspectRatio="none"
    >
      <line x1="0" y1="20" x2="180" y2="20" stroke="currentColor" opacity="0.14" />
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={waveformPoints(seed, pulse)}
      />
    </svg>
  );
}

function SleepBars() {
  const heights = [34, 48, 28, 60, 44, 38, 56, 72, 46, 64, 42, 54];
  return (
    <div className="sleep-bars" aria-label="Illustrative sleep trend">
      {heights.map((h, i) => (
        <i key={i} style={{ height: `${h}%`, opacity: 0.55 + (i % 3) * 0.16 }} />
      ))}
    </div>
  );
}

function AstronautBadge() {
  return (
    <div className="astronaut-badge" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="mednav-helmet-g" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#5b9bd5" />
            <stop offset="1" stopColor="#1e4d8c" />
          </linearGradient>
        </defs>
        <path
          d="M25 47Q20 17 50 14Q80 17 75 47L83 81Q50 92 17 81Z"
          fill="#e2e8f0"
          opacity="0.95"
        />
        <path
          d="M31 46Q25 24 50 24Q75 24 69 46Q65 65 50 66Q35 65 31 46"
          fill="#0a0a0c"
          stroke="url(#mednav-helmet-g)"
          strokeWidth="4"
        />
        <path
          d="M35 32Q47 23 59 30"
          stroke="#5b9bd5"
          strokeWidth="3.5"
          fill="none"
          opacity="0.65"
        />
        <path d="M24 74Q50 60 76 74L80 84Q50 94 20 84Z" fill="#3f4b5e" />
        <circle cx="26" cy="74" r="4.5" fill="#f5a623" />
        <circle cx="74" cy="74" r="4.5" fill="#5b9bd5" />
      </svg>
    </div>
  );
}

function downloadJSON(
  crew: Crew,
  inventory: Equipment[],
  response: ScenarioResponse | null,
  liveRecord?:SavedCheckIn|null
) {
  const sample = {
    project: 'MEDNAV',
    dataset_type: 'synthetic',
    exported_at: new Date().toISOString(),
    subject: liveRecord?{...liveRecord,baseline:crew.baseline,sleepBaseline:crew.sleepBaseline}:crew,
    ...(liveRecord?{illustrative_telemetry:{radiationDailyMsv:crew.radiationDailyMsv,radiationCumulativeMsv:crew.radiationCumulativeMsv,countermeasureMin:crew.countermeasureMin,bodyMassKg:crew.bodyMassKg,ocularCheck:crew.ocularCheck},persistence:'Local preview/export only; investigation/report not persisted or transmitted.'}:{}),
    inventory,
    investigation_response: response,
    note: 'All fields are synthetic demonstration values, not clinical data or diagnosis.',
  };
  const blob = new Blob([JSON.stringify(sample, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mednav-demo-${crew.id.toLowerCase().replace(/\s+/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MissionConsole({
  live=false, liveResponse=null, liveHistory=[], liveRecord=null,
  liveRecords=[],historyLoading=false,historyError='',onInvestigate,
  lastSyncedAt='',onRefresh,refreshing=false,
  crew,
  profiles,
  onSelectCrew,
  inventory,
  flags,
  setFlags,
  page,
  go,
  voiceResponse,
}: Props) {
  const history = (live ? liveHistory : fixtureHistory) as typeof fixtureHistory;
  const [selected, setSelected] = useState<keyof typeof evidence>('bp');
  const [dayIndex, setDayIndex] = useState(() => {
    const selectedIndex = liveRecord ? liveRecords.findIndex(r=>r.id===liveRecord.id) : -1;
    return selectedIndex>=0?selectedIndex:Math.max(0,history.length-1);
  });
  const [selectedPart, setSelectedPart] = useState('brain');
  const crewKey = crew.id.slice(-1).toLowerCase() as 'a' | 'b' | 'c';
  const bp = live ? crew.bp : flags[1] ? (crew.bp ?? null) : null;

  const fixtureRecords = useMemo<SavedCheckIn[]>(() => {
    return history.map((h, idx) => {
      const isLast = idx === history.length - 1;
      const hrVal = isLast ? crew.hr : (h[crewKey] ?? crew.hr);
      const sleepVal = isLast
        ? crew.sleep
        : (h[`s${crewKey}` as 'sa' | 'sb' | 'sc'] ?? crew.sleep);
      return {
        id: `FIX-${crew.id.replace(/\s+/g, '')}-D${174 + idx}`,
        astronaut_id: crew.id,
        hr: hrVal ?? null,
        sleep: sleepVal ?? null,
        bp: isLast ? bp : null,
        symptoms: isLast ? crew.symptoms : [],
        recorded_at: `2026-11-${String(9 + idx).padStart(2, '0')}T08:00:00Z`,
        provenance: 'Synthetic fixture history',
      };
    });
  }, [history, crew, crewKey, bp]);

  const effectiveRecords = live ? liveRecords : fixtureRecords;

  const [replaySelection,setReplaySelection]=useState<{crewId:string;id:string}|null>(null);
  useEffect(()=>setReplaySelection(null),[crew.id]);
  const replayId=replaySelection?.crewId===crew.id?replaySelection.id:null;
  let bodyHistory:SavedCheckIn[]=[],bodyRecord:SavedCheckIn|undefined,replayError=live?historyError:'';
  if((!live||(!historyLoading&&!historyError))&&effectiveRecords.length){try{const window=replayWindow(effectiveRecords,crew.id,replayId);bodyHistory=window.history;bodyRecord=window.record;}catch(e){replayError=(e as Error).message;}}
  const selectReplay=(id:string|null)=>setReplaySelection(id?{crewId:crew.id,id}:null);
  const [layerMode, setLayerMode] = useState<AnatomyLayerMode>('xray');
  const [autoRotate, setAutoRotate] = useState(false);
  const [sex, setSex] = useState<AnatomySex>('male');
  const [modelStatus, setModelStatus] = useState<AnatomyModelStatus>('loading');

  // Purely render the engine/fixture response — no separate medical decision logic in the frontend.
  const response = live
    ? liveResponse
    : voiceResponse && [2, 5].includes(page)
    ? (voiceResponse as unknown as ScenarioResponse)
    : getScenario(flags);
  useEffect(() => {
    if (live || page !== 2 || !response) return;
    const [sys, dia] = crew.bp?.split(' / ').map(Number) ?? [null, null];
    window.dispatchEvent(new CustomEvent('mednav:investigation-result', { detail: {
      response: asVoiceResponse(response, {
        resting_hr_bpm: crew.hr, sleep_hours: crew.sleep,
        systolic_bp_mm_hg: sys, diastolic_bp_mm_hg: dia,
      }), mode: 'demo',
    } }));
  }, [live, page, response, crew]);
  const view = formatInvestigationView(response);

  const focus = evidence[selected];
  const effectiveBp = live ? crew.bp : flags[1] ? (crew.bp ?? view.observationsBp ?? null) : null;
  const monitor = flags[0];

  const dosimeterAvailable =
    inventory.some((e) => e.name === 'Personal radiation dosimeter' && e.available && e.quantity>0);
  const ultrasoundAvailable =
    inventory.some((e) => e.name === 'Ultrasound unit' && e.available && e.quantity>0);

  const part = useMemo(
    () => partInfo(selectedPart, crew, bp),
    [crew, selectedPart, bp]
  );

  const focusPart = (partKey: string, preferredMode?: AnatomyLayerMode) => {
    setSelectedPart(partKey);
    if (preferredMode) setLayerMode(preferredMode);
  };

  const missing = live ? view.missingData : [
    crew.hr === null ? 'Heart rate' : null,
    crew.sleep === null ? 'Sleep' : null,
    crew.radiationDailyMsv === null ? 'Daily radiation dose' : null,
    crew.ocularCheck === null ? 'Microgravity ocular check' : null,
    ...(response?.missing_data ?? ['No scenario record']),
  ].filter(Boolean);

  const knownVitalsCount =
    (crew.hr !== null ? 1 : 0) +
    (crew.sleep !== null ? 1 : 0) +
    (bp !== null ? 1 : 0);

  const crewKey = crew.id.slice(-1).toLowerCase() as 'a' | 'b' | 'c';
  const activeHistoryDay = history[dayIndex] ?? history[history.length - 1] ?? {} as typeof fixtureHistory[number];
  const dayHr = activeHistoryDay[crewKey];
  const daySleep = activeHistoryDay[`s${crewKey}` as 'sa' | 'sb' | 'sc'];
  const dayRad = activeHistoryDay[`r${crewKey}` as 'ra' | 'rb' | 'rc'];
  const dayCounter = activeHistoryDay[`c${crewKey}` as 'ca' | 'cb' | 'cc'];

  // ---------------------------------------------------------------------------
  // VIEW 0: ASTRONAUT HEALTH OVERVIEW (WITH SPACE RADIATION & MICROGRAVITY)
  // ---------------------------------------------------------------------------
  if (page === 0) {
    const trendDataKey = crewKey;
    const trendColor = '#5B9BD5';

    const coverageTotal=live?3:8;
    const recordedCount = live?knownVitalsCount:[
      crew.hr,
      crew.sleep,
      bp,
      crew.radiationDailyMsv,
      crew.radiationCumulativeMsv,
      crew.countermeasureMin,
      crew.ocularCheck,
      crew.bodyMassKg,
    ].filter((v) => v !== null).length;

    const blockedBySensorCount = live?(bp===null&&!monitor?1:0):
      (bp === null && !monitor ? 1 : 0) +
      (crew.radiationDailyMsv === null && !dosimeterAvailable ? 1 : 0) +
      (crew.ocularCheck === null && !ultrasoundAvailable ? 1 : 0);
    const unknownOnlyCount = Math.max(0, coverageTotal - recordedCount - blockedBySensorCount);

    const recordedPct = Math.round((recordedCount / coverageTotal) * 100);
    const unknownOnlyPct = Math.round((unknownOnlyCount / coverageTotal) * 100);
    const blockedPct = Math.max(0, 100 - recordedPct - unknownOnlyPct);

    return (
      <div className="space-home" data-testid={live?'engine-status':undefined} data-status={view.status} aria-label={live?'Live investigation result':undefined}>
        {/* OVERVIEW 3-COLUMN INTERACTIVE 3D COMMAND CENTER */}
        <section
          className="overview-dashboard-section"
          aria-label="Crew health status dashboard"
        >
          <div className="dashboard-header-bar">
            <div className="dash-title-group">
              <div className="wide-planetary-label left-aligned">
                C R E W &nbsp; H E A L T H &nbsp; · &nbsp; D A Y &nbsp; 1 8 0
              </div>
              <h1 className="section-sans-headline">
                {crew.id} · {crew.role}
              </h1>
            </div>

            <div className="dash-workflow-controls">
              {live && (
                <button
                  type="button"
                  className="hairline-pill-btn"
                  disabled={refreshing}
                  onClick={onRefresh}
                >
                  Refresh recorded data
                </button>
              )}
              <div
                className="crew-tabs"
                role="region"
                aria-label="Select active crew member"
              >
                {profiles.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`crew-tab ${c.id === crew.id ? 'active' : ''}`}
                    onClick={() => onSelectCrew(c.id)}
                    aria-pressed={c.id === crew.id}
                  >
                    {c.id}
                  </button>
                ))}
              </div>

              <div className="dashboard-header-actions">
                <button
                  type="button"
                  className="hairline-pill-btn"
                  onClick={() => go(1)}
                >
                  Health Check-In
                </button>
                <button
                  type="button"
                  className="hairline-pill-btn active"
                  onClick={() => go(2)}
                >
                  Investigate <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="mednav-3d-dashboard-grid">
            {/* LEFT STACK: VITALS & SYMPTOMS */}
            <div className="left-stack">
              <article className="command-card vitals-card">
                <header className="command-card-header">
                  <div className="command-card-title">
                    <HeartPulse size={18} />
                    <span>Vitals &amp; Telemetry</span>
                  </div>
                  <span className="realtime-tag">
                    {knownVitalsCount}/3 Vitals
                  </span>
                </header>

                <div className="vital-list">
                  <button
                    type="button"
                    className="vital-row rail-reading"
                    onClick={() => focusPart('heart', 'organs')}
                  >
                    <HeartPulse className="vital-icon coral-txt" size={20} />
                    <div className="vital-copy">
                      <small>Heart Rate</small>
                      <strong className={crew.hr === null ? 'unknown-val' : ''}>
                        {crew.hr ?? 'Unknown'}
                        {crew.hr !== null && <sub> bpm</sub>}
                      </strong>
                    </div>
                    <MiniWave
                      tone={crew.hr === null ? 'amber' : 'coral'}
                      pulse={crew.hr !== null}
                      seed={4}
                    />
                  </button>

                  <button
                    type="button"
                    className="vital-row rail-reading"
                    onClick={() => focusPart('heart', 'organs')}
                  >
                    <Stethoscope className="vital-icon ok-txt" size={20} />
                    <div className="vital-copy">
                      <small>Blood Pressure</small>
                      <strong className={!bp ? 'unknown-val bp-number' : 'bp-number'}>
                        {bp ?? 'Unknown'}
                        {bp && <sub> mmHg</sub>}
                      </strong>
                    </div>
                    <MiniWave tone={!bp ? 'amber' : 'cobalt'} seed={7} />
                  </button>

                  <button
                    type="button"
                    className="vital-row rail-reading"
                    onClick={() => focusPart('brain', 'organs')}
                  >
                    <Moon className="vital-icon ok-txt" size={20} />
                    <div className="vital-copy">
                      <small>Sleep</small>
                      <strong className={crew.sleep === null ? 'unknown-val' : ''}>
                        {crew.sleep ?? 'Unknown'}
                        {crew.sleep !== null && <sub> h</sub>}
                      </strong>
                    </div>
                    <SleepBars />
                  </button>

                  <button
                    type="button"
                    className="hazard-row-btn"
                    onClick={() => focusPart('skin', 'surface')}
                  >
                    <Radiation size={16} className="amber-text" />
                    <div className="hazard-row-copy">
                      <small>Radiation</small>
                      <strong
                        className={
                          crew.radiationDailyMsv === null ? 'unknown-val' : ''
                        }
                      >
                        {crew.radiationDailyMsv !== null
                          ? `${crew.radiationDailyMsv} mSv/d`
                          : 'Unknown'}
                      </strong>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="hazard-row-btn"
                    onClick={() => focusPart('femur_l', 'skeleton')}
                  >
                    <Dumbbell size={16} className="ok-txt" />
                    <div className="hazard-row-copy">
                      <small>ARED Exercise</small>
                      <strong
                        className={
                          crew.countermeasureMin === null ? 'unknown-val' : ''
                        }
                      >
                        {crew.countermeasureMin !== null
                          ? `${crew.countermeasureMin}/${crew.countermeasureTargetMin} min`
                          : 'Unknown'}
                      </strong>
                    </div>
                  </button>
                </div>
                {live && <p className="part-note" data-testid="sync-status">{historyError ? 'Synchronization failed. ' : refreshing ? 'Synchronizing recorded data... ' : ''}Last synchronized: {lastSyncedAt || 'Not yet synchronized'}</p>}
              </article>

              <article className="command-card symptoms-card">
                <header className="command-card-header">
                  <div className="command-card-title">
                    <ClipboardList size={18} />
                    <span>Symptoms</span>
                  </div>
                  <button
                    type="button"
                    className="mini-action-link"
                    onClick={() => go(1)}
                  >
                    Edit
                  </button>
                </header>

                <div className="symptoms-compact-list">
                  {crew.symptoms.length > 0 ? (
                    crew.symptoms.map((sym) => {
                      const label = sym.replace(/\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '');
                      return (
                        <div className="symptom-line" key={sym}>
                          <span>{label}</span>
                          <span className="kpi-status-pill coral">ACTIVE</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="symptom-line">
                      <span>None reported</span>
                      <span className="kpi-status-pill ok">CLEAR</span>
                    </div>
                  )}
                </div>
              </article>
            </div>

            {/* CENTER STAGE: INTERACTIVE 3D HUMAN ANATOMY */}
            <BodyViewer
              selectedPart={selectedPart}
              setSelectedPart={setSelectedPart}
              layerMode={layerMode}
              setLayerMode={setLayerMode}
              autoRotate={autoRotate}
              setAutoRotate={setAutoRotate}
              sex={sex}
              setSex={setSex}
              modelStatus={modelStatus}
              setModelStatus={setModelStatus}
            />

            {/* RIGHT STACK: NEXT CHECK & SELECTED ANATOMY */}
            <div className="right-stack">
              <article className="command-card next-check-status-card compact-nc">
                <div className="nc-card-header">
                  <span className="wide-planetary-label left-aligned">
                    N E X T &nbsp; C H E C K
                  </span>
                  <span className={`kpi-status-pill ${view.statusTone}`}>
                    {view.statusBadge}
                  </span>
                </div>

                <h3>{view.nextCheckTitle}</h3>

                <div className="slide-action-pill-track">
                  <button
                    type="button"
                    className="slide-pill-secondary"
                    onClick={() => go(1)}
                  >
                    Check-In
                  </button>
                  <button
                    type="button"
                    className="slide-pill-thumb"
                    onClick={() => go(2)}
                    aria-label="Open Health Investigation"
                  >
                    <span>Investigate</span>
                    <ArrowUpRight size={16} />
                  </button>
                </div>
              </article>

              <article className="command-card selected-card">
                <header className="command-card-header">
                  <div className="command-card-title">
                    <ScanLine size={18} />
                    <span>Selected Region</span>
                  </div>
                  <span className="kpi-status-pill ok">{part.system}</span>
                </header>

                <div className="selected-top">
                  <div className="selected-organ-icon">
                    <UserRound size={20} />
                  </div>
                  <div className="selected-title-wrap">
                    <small>{part.system}</small>
                    <h3>{part.label}</h3>
                  </div>
                </div>

                <BodyGraphNavigator
                  crew={crew}
                  records={effectiveRecords}
                  history={bodyHistory}
                  record={bodyRecord}
                  replaying={replayId !== null}
                  part={selectedPart}
                  loading={live ? historyLoading : false}
                  error={replayError}
                  onReplay={selectReplay}
                  onPart={(key) => {
                    const system = BODY_SYSTEMS.find((s) => s.part === key);
                    focusPart(key, system?.mode ?? 'organs');
                  }}
                  onInvestigate={(id) => (onInvestigate ? onInvestigate(id) : go(2))}
                />
                {bodyRegion(selectedPart) ? (
                  <BodySystemMonitoring
                    part={selectedPart}
                    crew={crew}
                    records={bodyHistory}
                    loading={live ? historyLoading : false}
                    error={replayError}
                    replaying={replayId !== null}
                    onInvestigate={() => {
                      if (bodyRecord && onInvestigate) onInvestigate(bodyRecord.id);
                      else go(2);
                    }}
                  />
                ) : (
                  <div className="selected-metric">
                    <span>{part.metric}</span>
                    <strong
                      className={
                        part.value.includes('Unknown') ? 'unknown-val' : ''
                      }
                    >
                      {part.value}
                    </strong>
                  </div>
                )}
              </article>
            </div>
          </div>

          {/* 7-DAY TELEMETRY TREND CARD */}
          <div className="dashboard-below-trend">
            <article className="orbital-trend-card">
              <div className="trend-card-head">
                <div>
                  <span className="wide-planetary-label left-aligned">
                    S A V E D &nbsp; H E A L T H &nbsp; H I S T O R Y
                  </span>
                </div>

                <div className="trend-mode-pills">
                  <span className="hairline-pill-btn active">
                    Heart Rate
                  </span>
                </div>
              </div>

              <MissionHealthTimeline
                key={crew.id}
                crew={crew}
                records={effectiveRecords}
                loading={live ? historyLoading : false}
                error={live ? historyError : ''}
                onRegion={(region, id) => {
                  if (id) selectReplay(id);
                  focusPart(region, 'organs');
                  document.querySelector('.selected-card')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }}
                onReplay={(id) => {
                  selectReplay(id);
                  document.querySelector('.selected-card')?.scrollIntoView({ block: 'center', behavior: 'instant' });
                }}
                onInvestigate={(id) => (onInvestigate ? onInvestigate(id) : go(2))}
              />
            </article>
          </div>
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW 5: INCIDENT REPORT
  // ---------------------------------------------------------------------------
  if (page === 5) {
    const vitalsRows = [
      ['Heart Rate', crew.hr === null ? 'Unknown' : `${crew.hr} bpm`],
      ['Sleep', crew.sleep === null ? 'Unknown' : `${crew.sleep} h`],
      ['Blood Pressure', bp ?? 'Unknown'],
      ['Symptoms', crew.symptoms.join(', ') || 'None reported'],
      ['Missing Data', missing.join(', ') || 'None'],
    ];
    const envRows = [
      [
        'Daily Radiation',
        crew.radiationDailyMsv === null
          ? 'Unknown'
          : `${crew.radiationDailyMsv} mSv/d`,
      ],
      [
        '180d Radiation',
        crew.radiationCumulativeMsv === null
          ? 'Unknown'
          : `${crew.radiationCumulativeMsv} mSv`,
      ],
      [
        'ARED Exercise',
        crew.countermeasureMin === null
          ? 'Unknown'
          : `${crew.countermeasureMin}/${crew.countermeasureTargetMin} min`,
      ],
      [
        'Body Mass',
        crew.bodyMassKg === null ? 'Unknown' : `${crew.bodyMassKg} kg`,
      ],
      [
        'Ocular (SANS)',
        live ? 'Not recorded' : crew.ocularCheck ?? 'Unknown',
      ],
      ['BP Monitor', monitor ? 'Available' : 'Unavailable'],
      ['Ultrasound', ultrasoundAvailable ? 'Available' : 'Unavailable'],
      ['Earth Link', flags[2] ? 'Online (sim)' : 'Offline'],
    ];

    return (
      <div
        className="mission-console space-subpage incident-report"
        data-testid={live ? 'engine-status' : undefined}
        data-status={view.status}
        aria-label={live ? 'Live investigation result' : undefined}
      >
        <div className="subpage-top-bar">
          <button
            type="button"
            className="hairline-pill-btn"
            onClick={() => go(2)}
          >
            <ArrowLeft size={16} /> Back to Investigation
          </button>
          <div className="wide-planetary-label">
            I N C I D E N T &nbsp; R E P O R T
          </div>
          <span className="hairline-status-tag">
            {live
              ? 'LOCAL PREVIEW · NOT TRANSMITTED'
              : 'PENDING GROUND REVIEW · OFFLINE'}
          </span>
        </div>

        <div className="subpage-intro">
          <span className="subpage-eyebrow">{crew.id.toUpperCase()} · LOCAL RECORD</span>
          <h1>Incident report</h1>
          <p>A concise record of observations, context, and the investigation decision.</p>
        </div>

        {/* Summary KPI Strip */}
        <section className="ir-summary-grid" aria-label="Incident summary">
          <div className="inv-stat-card">
            <span className="inv-stat-label">CREW / SCENARIO</span>
            <strong>
              {crew.id} · {view.id}
            </strong>
            <small>{crew.role}</small>
          </div>
          <div className="inv-stat-card">
            <span className="inv-stat-label">STATUS</span>
            <strong
              className={
                view.status === 'escalate' ? 'unknown-val' : 'ok-txt'
              }
            >
              {view.statusBadge}
            </strong>
            <small>{view.status}</small>
          </div>
          <div className="inv-stat-card">
            <span className="inv-stat-label">NEXT CHECK</span>
            <strong>{view.hasNextCheck ? view.nextCheckTitle : 'None'}</strong>
            <small>
              {view.hasNextCheck ? 'Approved protocol' : 'No check selected'}
            </small>
          </div>
          <div className="inv-stat-card">
            <span className="inv-stat-label">CLINICAL SCOPE</span>
            <strong>Non-Diagnostic</strong>
            <small>Navigation &amp; handoff record</small>
          </div>
        </section>

        <div className="asymmetric-workspace-grid">
          <section className="left-telemetry-column ir-cards-col">
            <div className="ir-section-card">
              <div className="ir-card-head">
                <HeartPulse size={16} className="inv-accent-icon" />
                <h2>Vitals &amp; Symptoms</h2>
              </div>
              <dl className="ir-kv-grid">
                {vitalsRows.map(([k, v]) => (
                  <div className="ir-kv-tile" key={k}>
                    <dt>{k}</dt>
                    <dd className={v === 'Unknown' ? 'unknown-val' : ''}>
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="ir-section-card">
              <div className="ir-card-head">
                <Activity size={16} className="inv-accent-icon" />
                <h2>Environment &amp; Equipment</h2>
              </div>
              <dl className="ir-kv-grid">
                {envRows.map(([k, v]) => (
                  <div className="ir-kv-tile" key={k}>
                    <dt>{k}</dt>
                    <dd
                      className={
                        v === 'Unknown' || v === 'Unavailable'
                          ? 'unknown-val'
                          : ''
                      }
                    >
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <aside className="right-frosted-sheet ir-rationale-panel">
            <div className="wide-planetary-label left-aligned">
              C H E C K L I S T &nbsp; R A T I O N A L E
            </div>
            <h3>Decision Summary</h3>

            <div className="ir-rationale-block">
              <span className="ir-block-label">
                <ShieldCheck size={14} className="ok-txt" /> WHY SELECTED
              </span>
              <p>{view.selectedExplanation}</p>
            </div>

            <div className="ir-rationale-block">
              <span className="ir-block-label">
                <Info size={14} className="inv-accent-icon" /> WHY EXCLUDED
              </span>
              <p>{view.excludedExplanation}</p>
            </div>

            <div className="sheet-divider" />

            <div className="telemetry-kv-row compact">
              <dt>Data Source:</dt>
              <dd
                title={
                  liveRecord
                    ? `${liveRecord.id} / ${liveRecord.recorded_at} / ${liveRecord.provenance}`
                    : undefined
                }
              >
                {live
                  ? 'Saved health record (synthetic)'
                  : 'Synthetic Demo Record'}
              </dd>
            </div>
            <div className="telemetry-kv-row compact">
              <dt>Clinical Scope:</dt>
              <dd>Non-Diagnostic Navigation</dd>
            </div>

            <button
              type="button"
              className="ghost-rect-cta full-width export-json-btn"
              onClick={() => downloadJSON(crew, inventory, response, liveRecord)}
            >
              <Download size={16} />
              <span>Export JSON</span>
            </button>
          </aside>
        </div>
      </div>
    );
  }

  return null;
}
