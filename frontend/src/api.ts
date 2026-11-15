import {crews, equipment, type Crew, type Equipment} from './data/fixtures';
import {useEffect, useRef, useState} from 'react';
import {orderedRecords} from './data/bodyMonitoring';
import type {ScenarioResponse} from './types/scenario';
import type {
  AstronautDTO,
  EngineResponse,
  FollowUpCreate,
  FollowUpEvent,
  InvestigationSessionDTO,
  MedicationStockDTO,
  MissionContextDTO,
  SavedCheckIn as Saved,
  MedicalReportDTO,
  ReportSnapshotDTO,
  EarthStatusDTO,
  CrewProactiveAlertDTO,
} from './types/api';
import {displayProfile, recordedProfile} from './types/api';
export const PAGES_DEMO = (import.meta as unknown as {env:Record<string,string>}).env.VITE_PAGES_DEMO === 'true';
export const API = (import.meta as unknown as {env:Record<string,string>}).env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';
async function request<T>(path:string, method='GET', body?:unknown, extraHeaders?:Record<string,string>):Promise<T>{
  let response:Response;
  try { response=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...extraHeaders},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)}); }
  catch { throw new Error('Backend unavailable. Start FastAPI or explicitly select local fixture mode.'); }
  const data=await response.json();
  if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:`API ${response.status}: invalid request`);
  return data;
}
export const investigationApi = {
  getCrewAlerts: () => request<CrewProactiveAlertDTO[]>('/investigation/crew-alerts'),
  getMissionContext: () => request<MissionContextDTO>('/investigation/mission-context'),
  updateMissionContext: (patch: {
    crew_count?: number;
    remaining_days?: number;
    medications?: { id: string; quantity: number }[];
  }) => request<MissionContextDTO>('/investigation/mission-context', 'PATCH', patch),
  resetMissionContext: () => request<MissionContextDTO>('/investigation/mission-context/reset', 'POST'),
  getLatestSession: (astronautId: string) =>
    request<InvestigationSessionDTO>(`/investigation/sessions/latest/${encodeURIComponent(astronautId)}`),
  startSession: (payload: {
    astronaut_id: string;
    check_in_id?: string;
  }) => request<InvestigationSessionDTO>('/investigation/sessions', 'POST', payload),
  submitAnswer: (
    sessionId: string,
    payload: { question_id: string; answer_value: string; numeric_value?: number }
  ) => request<InvestigationSessionDTO>(`/investigation/sessions/${encodeURIComponent(sessionId)}/answer`, 'POST', payload),
  dispenseAllocation: (sessionId: string, medicationId?: string) =>
    request<InvestigationSessionDTO>(
      `/investigation/sessions/${encodeURIComponent(sessionId)}/dispense`,
      'POST',
      medicationId ? { medication_id: medicationId } : undefined
    ),
  createSyntheticCheckIn: (payload: {
    astronaut_id: string;
    hr: number | null;
    sleep: number | null;
    bp: string | null;
    symptoms: string[];
  }) => request<Saved>('/check-ins', 'POST', payload),
};
export async function loadHistory(crewId:string,readPage=request<Saved[]>):Promise<Saved[]> {
 const rows:Saved[]=[];
 for(let offset=0;;offset+=1000){
  const page=await readPage(`/astronauts/${encodeURIComponent(crewId)}/history?limit=1000&offset=${offset}`);
  if(page.some(r=>r.astronaut_id!==crewId))throw new Error('History response does not match selected crew.');
  rows.push(...page);if(page.length<1000)return orderedRecords(rows,crewId);
 }
}
export async function loadFollowUps(crewId:string,checkInId?:string):Promise<FollowUpEvent[]> {
 const rows:FollowUpEvent[]=[];
 for(let offset=0;;offset+=1000){
  const query=new URLSearchParams({limit:'1000',offset:String(offset)});
  if(checkInId)query.set('check_in_id',checkInId);
  const page=await request<FollowUpEvent[]>(`/astronauts/${encodeURIComponent(crewId)}/follow-ups?${query}`);
  if(page.some(r=>r.astronaut_id!==crewId||(checkInId&&r.check_in_id!==checkInId)))throw new Error('Follow-up response does not match selected crew/check-in.');
  rows.push(...page);if(page.length<1000)return rows;
 }
}
export function createFollowUp(body:FollowUpCreate){return request<FollowUpEvent>('/follow-ups','POST',body);}
const officer = (key:string) => ({'X-MEDNAV-Officer-Key':key});
export const reportApi = {
  preview: (astronautId:string) => request<ReportSnapshotDTO>(`/reports/preview?astronaut_id=${encodeURIComponent(astronautId)}`),
  list: (astronautId:string) => request<MedicalReportDTO[]>(`/reports?astronaut_id=${encodeURIComponent(astronautId)}`),
  get: (id:string) => request<MedicalReportDTO>(`/reports/${encodeURIComponent(id)}`),
  create: (astronautId:string,reportType='Weekly Summary') => request<MedicalReportDTO>('/reports','POST',{astronaut_id:astronautId,report_type:reportType}),
  regenerate: (id:string) => request<MedicalReportDTO>(`/reports/${encodeURIComponent(id)}/versions`,'POST'),
  versions: (id:string) => request<{version:number;created_at:string;pdf_name:string;pdf_size:number;sha256:string}[]>(`/reports/${encodeURIComponent(id)}/versions`),
  audit: (id:string) => request<{event:string;detail:string;version:number|null;recorded_at:string}[]>(`/reports/${encodeURIComponent(id)}/audit`),
  reviews: (id:string) => request<{reviewer:string;outcome:string;notes:string;requested_measurements:string|null;follow_up_tasks:string|null;checklist_reviewed:boolean;recorded_at:string}[]>(`/reports/${encodeURIComponent(id)}/reviews`),
  review: (id:string,key:string,body:{reviewer:string;outcome:string;notes:string;requested_measurements?:string;follow_up_tasks?:string;checklist_reviewed:boolean}) => request<MedicalReportDTO>(`/reports/${encodeURIComponent(id)}/reviews`,'POST',body,officer(key)),
  medication: (key:string,body:{astronaut_id:string;medication_name:string;dose?:string;route?:string;status:string;taken_at?:string;source:string;recorded_by:string;confirmed:boolean}) => request<{id:string;recorded_at:string}>('/medication-administrations','POST',body,officer(key)),
  queue: (id:string,key:string) => request<MedicalReportDTO>(`/reports/${encodeURIComponent(id)}/queue`,'POST',undefined,officer(key)),
  retry: (id:string,key:string) => request<MedicalReportDTO>(`/reports/${encodeURIComponent(id)}/retry`,'POST',undefined,officer(key)),
  earth: () => request<EarthStatusDTO>('/earth/status'),
  setEarth: (online:boolean,key:string) => request<EarthStatusDTO>('/earth/status','POST',{online},officer(key)),
  received: () => request<{id:string;report_id:string;version:number;sha256:string;received_at:string}[]>('/earth/received'),
  pdfUrl: (id:string,version?:number,download=false) => {
    const params=new URLSearchParams();
    if(version)params.set('version',String(version));
    if(download)params.set('download','true');
    return `${API}/reports/${encodeURIComponent(id)}/pdf?${params}`;
  },
};
export function useBackend(crewId:string,refreshOnFocus=true){
 const live=!PAGES_DEMO && new URLSearchParams(location.search).get('mode')!=='fixture';
 const [profiles,setProfiles]=useState(crews),[inventory,setInventory]=useState(equipment),[medications,setMedications]=useState<MedicationStockDTO[]>([]),[flags,setFlags]=useState([false,false,false,false]);
 const [result,setResult]=useState<ScenarioResponse|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(!live),[revision,setRevision]=useState(0);
 const [historyState,setHistoryState]=useState<{crewId:string;rows:Saved[];loading:boolean;error:string;syncedAt:string}>({crewId:'',rows:[],loading:false,error:'',syncedAt:''});
 const [initialized,setInitialized]=useState(!live),[resultCrew,setResultCrew]=useState(''),[record,setRecord]=useState<Saved|null>(null),[pendingWrites,setPendingWrites]=useState(0),[writeError,setWriteError]=useState('');
 const [selection,setSelection]=useState<{crewId:string;id:string}|null>(null);
 const selectedId=selection?.crewId===crewId?selection.id:'';
 const writes=useRef<Promise<void>>(Promise.resolve());
 const forceEvaluation=useRef(false);
 const lastEvaluation=useRef<{key:string;response:EngineResponse}|null>(null);
 const lastFocusRefresh=useRef(0);

 // No timer polling. Coalesce focus/visibility events only on the Dashboard;
 // revalidation must not discard a check-in or follow-up draft on other pages.
 useEffect(()=>{
  if(!live||!refreshOnFocus||pendingWrites)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const focus=()=>{
   if(document.visibilityState!=='visible'||Date.now()-lastFocusRefresh.current<1000)return;
   clearTimeout(timer);
   timer=setTimeout(()=>{lastFocusRefresh.current=Date.now();setRevision(n=>n+1)},100);
  };
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)};
 },[live,refreshOnFocus,pendingWrites]);

 useEffect(()=>{
  if(!live||pendingWrites)return;
  let active=true,historyLoaded=false;
  setBusy(true);setReady(false);
  setHistoryState(previous=>({crewId,rows:previous.crewId===crewId?previous.rows:[],loading:true,error:'',syncedAt:previous.crewId===crewId?previous.syncedAt:''}));
  async function synchronize(){
   try{
    const [people,items,mission,historyResult]=await Promise.all([
     request<AstronautDTO[]>('/astronauts'),
     request<Equipment[]>('/inventory'),
     investigationApi.getMissionContext(),
     loadHistory(crewId).then(rows=>({rows,error:null as Error|null})).catch((error:Error)=>({rows:[] as Saved[],error}))
    ]);
    if(!active)return;
    if(!people.length)throw new Error('No synthetic astronaut profiles available. Import demo data before check-in.');
    if(!people.some(p=>p.id===crewId)){
     // Preserve bootstrap for datasets whose IDs differ from the default crew.
     // App selects a real returned ID; no substitute medical record is invented.
     setProfiles(people.map(p=>displayProfile(p,crews)));setInventory(items);setMedications(mission.medications);setInitialized(true);setRecord(null);setResult(null);
     setHistoryState({crewId,rows:[],loading:false,error:'',syncedAt:''});return;
    }
    if(historyResult.error)throw historyResult.error;
    const rows=historyResult.rows;
    // Commit profile metadata, inventory and full history together. All vital
    // displays derive from rows, even if another writer changed data between GETs.
    setProfiles(people.map(p=>displayProfile(p,crews)));setInventory(items);setMedications(mission.medications);
    setFlags(f=>[items.some(i=>i.name==='Blood-pressure monitor'&&i.available&&i.quantity>0),f[1],f[2],f[3]]);
    setHistoryState({crewId,rows,loading:false,error:'',syncedAt:new Date().toISOString()});
    setInitialized(true);setReady(true);historyLoaded=true;
    const target=selectedId?rows.find(r=>r.id===selectedId):rows.at(-1);
    if(!target)throw new Error(selectedId?'Selected check-in is unavailable for this astronaut.':'Save a check-in before investigation.');
    setRecord(target);
    const profile=people.find(p=>p.id===crewId)!;
    const body={check_in_id:target.id,communication_status:flags[2]?'online':'offline',emergency_override:flags[3]};
    const key=JSON.stringify({body,baseline:profile.baseline,sleepBaseline:profile.sleepBaseline,inventory:items.map(i=>[i.name,i.quantity,i.available])});
    const forced=forceEvaluation.current;forceEvaluation.current=false;
    if(!forced&&lastEvaluation.current?.key===key){setResultCrew(crewId);setResult(lastEvaluation.current.response);setError('');return;}
    setResult(null);
    const response=await request<EngineResponse>('/investigations/evaluate','POST',body);
    if(active){lastEvaluation.current={key,response};setResultCrew(crewId);setResult(response);setError('');}
   }catch(e){
    if(!active)return;
    const message=(e as Error).message;setError(message);setResult(null);
    if(!historyLoaded){setRecord(null);setHistoryState(previous=>({crewId,rows:[],loading:false,error:message,syncedAt:previous.crewId===crewId?previous.syncedAt:''}));}
   }finally{if(active)setBusy(false)}
  }
  void synchronize();return()=>{active=false};
 },[live,crewId,revision,flags[2],flags[3],pendingWrites,selectedId]);

 async function save(c:Crew){
  if(!live){setProfiles(p=>p.map(x=>x.id===c.id?c:x));return;}
  setError('');const saved=await request<Saved>('/check-ins','POST',{astronaut_id:c.id,hr:c.hr,sleep:c.sleep,bp:c.bp,symptoms:c.symptoms});
  setResult(null);setSelection({crewId:c.id,id:saved.id});setRevision(r=>r+1);
 }
 async function updateInventory(name:string,available:boolean){
  if(!live){setInventory(v=>v.map(x=>x.name===name?{...x,available}:x));setFlags(f=>[name==='Blood-pressure monitor'?available:f[0],f[1],f[2],f[3]]);return;}
  setPendingWrites(n=>n+1);setWriteError('');setBusy(true);setResult(null);
  const task=writes.current.then(async()=>{await request(`/inventory/${encodeURIComponent(name)}`,'PATCH',{available})});writes.current=task.catch(()=>{});
  try{await task;setRevision(r=>r+1)}catch(e){setWriteError((e as Error).message)}finally{setPendingWrites(n=>n-1);setBusy(false)}
 }
 async function updateMedicationQuantity(id:string,quantity:number){
  if(!live)return;
  setWriteError('');
  const updated=await investigationApi.updateMissionContext({medications:[{id,quantity}]});
  setMedications(updated.medications);
 }
 async function refreshMissionData(){
  if(!live)return;
  const ctx=await investigationApi.getMissionContext();
  setMedications(ctx.medications);
 }
 function changeFlags(next:boolean[]){
  if(!live){setFlags(next);return;}
  if(next[0]===flags[0]&&next[2]===flags[2]&&next[3]===flags[3])return;
  setBusy(true);setError('');setResult(null);
  if(next[0]!==flags[0])void updateInventory('Blood-pressure monitor',next[0]);
  setFlags(f=>[f[0],f[1],next[2],next[3]]);
 }
 const records=historyState.crewId===crewId?historyState.rows:[];
 const shownProfiles=live?profiles.map(p=>p.id===crewId?recordedProfile(p,records.at(-1)):{...p,ocularCheck:null}):profiles;
 const history=records.map(r=>({day:r.recorded_at.slice(0,10),recorded_at:r.recorded_at,[crewId.slice(-1).toLowerCase()]:r.hr,['s'+crewId.slice(-1).toLowerCase()]:r.sleep}));
 function investigate(id?:string){
  const target=id?records.find(r=>r.id===id):records.at(-1);
  setResult(null);if(!target){setError('No saved check-in available for this astronaut.');return;}
  forceEvaluation.current=true;setError('');setBusy(true);setSelection({crewId,id:target.id});setRevision(r=>r+1);
 }
 const current=resultCrew===crewId&&!pendingWrites?result:null;
 return {live,profiles:shownProfiles,inventory,medications,flags:live?[flags[0],record?.astronaut_id===crewId&&record.bp!=null,flags[2],flags[3]]:flags,
  result:current,error:writeError||error,busy:busy||pendingWrites>0,ready,initialized,history,records,
  historyLoading:historyState.crewId!==crewId||historyState.loading,historyError:historyState.crewId===crewId?historyState.error:'',lastSyncedAt:historyState.crewId===crewId?historyState.syncedAt:'',
  record:record?.astronaut_id===crewId?record:null,savedId:record?.astronaut_id===crewId?record.id:'',
  investigate,selectLatest:()=>setSelection(null),save,updateInventory,updateMedicationQuantity,refreshMissionData,changeFlags,
  refresh:()=>{if(!pendingWrites)setRevision(r=>r+1)},
  retry:()=>{forceEvaluation.current=true;setWriteError('');setRevision(r=>r+1)}};
}
