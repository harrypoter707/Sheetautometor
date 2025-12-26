
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Play, Pause, Trash2, Database, BarChart3, Layers, 
  Timer, Globe, Settings2, Activity, Clipboard, 
  CheckCircle, AlertCircle, ArrowRight, ExternalLink, Info, Key, FileSpreadsheet, Copy, Check, ListOrdered, TrendingUp, LogOut, ShieldCheck, Lock, UserPlus, LogIn, Mail
} from 'lucide-react';
import { AutomationSettings, EngineStatus, SubmissionLog, User } from './types';
import { AutomationEngine } from './services/automationEngine';

const STORAGE_KEY_PREFIX = 'sheet_auto_v12';

// ENHANCED BACKEND CODE: Checks for global duplicates in the sheet before appending
const BACKEND_CODE = `function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(data.sheetName || "Sheet1");
  
  if (!sheet) {
    return ContentService.createTextOutput("Error: Sheet '" + data.sheetName + "' not found.");
  }

  // 1. Get all existing URLs from Column A to check for duplicates
  var lastRow = sheet.getLastRow();
  var existingUrls = [];
  if (lastRow > 0) {
    // We map to strings to ensure easy comparison
    existingUrls = sheet.getRange(1, 1, lastRow, 1).getValues().map(function(row) { 
      return String(row[0]).trim(); 
    });
  }

  var addedCount = 0;
  var skippedCount = 0;

  // 2. Process each URL in the batch
  data.urls.forEach(function(url) {
    var cleanUrl = String(url).trim();
    
    // Check if URL already exists in the sheet
    if (existingUrls.indexOf(cleanUrl) === -1) {
      // APPENDS AFTER LAST ENTRY
      sheet.appendRow([cleanUrl, new Date()]);
      existingUrls.push(cleanUrl); // Prevent duplicates within the same batch too
      addedCount++;
    } else {
      skippedCount++;
    }
  });

  return ContentService.createTextOutput("Success: Added " + addedCount + ", Skipped " + skippedCount + " duplicates.");
}`;

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}_user`);
    return saved ? JSON.parse(saved) : null;
  });

  const storageKey = useMemo(() => user ? `${STORAGE_KEY_PREFIX}_${user.id}` : STORAGE_KEY_PREFIX, [user]);

  const [settings, setSettings] = useState<AutomationSettings>(() => {
    const saved = localStorage.getItem(`${storageKey}_settings`);
    return saved ? JSON.parse(saved) : { 
      webhookUrl: '', 
      sheetUrl: '',
      sheetName: 'Sheet1',
      batchSize: 10,
      intervalMinutes: 2
    };
  });

  const [rawInput, setRawInput] = useState('');
  const [pendingQueue, setPendingQueue] = useState<string[]>(() => {
    const saved = localStorage.getItem(`${storageKey}_pending`);
    return saved ? JSON.parse(saved) : [];
  });
  const [history, setHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem(`${storageKey}_history`);
    return saved ? JSON.parse(saved) : [];
  });
  const [logs, setLogs] = useState<SubmissionLog[]>(() => {
    const saved = localStorage.getItem(`${storageKey}_logs`);
    return saved ? JSON.parse(saved).map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })) : [];
  });

  const [engineStatus, setEngineStatus] = useState<EngineStatus>(EngineStatus.IDLE);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const engine = useMemo(() => new AutomationEngine(), []);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historySet = useMemo(() => new Set(history), [history]);

  const totalUrlsInSession = useMemo(() => pendingQueue.length + history.length, [pendingQueue.length, history.length]);
  const progressPercent = totalUrlsInSession > 0 ? (history.length / totalUrlsInSession) * 100 : 0;

  useEffect(() => {
    if (user) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}_user`, JSON.stringify(user));
      localStorage.setItem(`${storageKey}_settings`, JSON.stringify(settings));
      localStorage.setItem(`${storageKey}_pending`, JSON.stringify(pendingQueue));
      localStorage.setItem(`${storageKey}_history`, JSON.stringify(history));
      localStorage.setItem(`${storageKey}_logs`, JSON.stringify(logs));
    }
  }, [user, settings, pendingQueue, history, logs, storageKey]);

  useEffect(() => {
    const initGoogle = () => {
      // @ts-ignore
      google.accounts.id.initialize({
        client_id: '714353245318-du543no0tltukgrs4nim5ds7u2asjkka.apps.googleusercontent.com',
        callback: handleCredentialResponse,
      });
      document.querySelectorAll(".googleBtnContainer").forEach(container => {
        // @ts-ignore
        google.accounts.id.renderButton(container, { theme: "filled_blue", size: "large", width: 250, text: "continue_with" });
      });
    };

    if (typeof window !== 'undefined') {
      // @ts-ignore
      if (window.google) initGoogle();
      else {
        // @ts-ignore
        window.onGoogleLibraryLoad = initGoogle;
      }
    }
  }, [user]);

  const handleCredentialResponse = (response: any) => {
    const base64Url = response.credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    const payload = JSON.parse(jsonPayload);
    
    setUser({
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      id: payload.sub
    });
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}_user`);
  };

  const addLog = useCallback((log: Omit<SubmissionLog, 'id' | 'timestamp'>) => {
    setLogs(prev => [{
      ...log,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date()
    }, ...prev].slice(0, 500));
  }, []);

  const handleAddUrls = () => {
    if (!user) return;
    const lines = rawInput.split(/[\n,]/);
    // Client-side quick filter (prevents dupes within the CURRENT list being added)
    const urls = lines
      .map(l => l.trim())
      .filter(l => l.startsWith('http'))
      .filter(l => !historySet.has(l) && !pendingQueue.includes(l));
    
    setPendingQueue(prev => [...prev, ...urls]);
    setRawInput('');
    if (urls.length > 0) addLog({ url: 'SYSTEM', status: 'success', message: `Queued ${urls.length} items.`, batchId: 'ADD' });
  };

  const processBatch = useCallback(async () => {
    if (engineStatus === EngineStatus.IDLE) return;

    setPendingQueue(currentQueue => {
      if (currentQueue.length === 0) {
        setEngineStatus(EngineStatus.IDLE);
        addLog({ url: 'SYSTEM', status: 'success', message: 'Cycle Finished.', batchId: 'DONE' });
        return [];
      }

      setEngineStatus(EngineStatus.PROCESSING);
      const batch = currentQueue.slice(0, settings.batchSize);
      const remaining = currentQueue.slice(settings.batchSize);
      const bId = Math.random().toString(36).substr(2, 4).toUpperCase();

      engine.submitBatch(batch, settings).then(res => {
        if (res.success) {
          setHistory(prev => [...prev, ...batch]);
          batch.forEach(u => addLog({ url: u, status: 'success', message: 'Sent to Bridge', batchId: bId }));
          
          if (remaining.length > 0) {
            setEngineStatus(EngineStatus.WAITING);
            const secs = settings.intervalMinutes * 60;
            setCountdown(secs);
            timerRef.current = setTimeout(() => processBatch(), secs * 1000);
          } else {
            setEngineStatus(EngineStatus.IDLE);
          }
        } else {
          addLog({ url: 'NETWORK ERROR', status: 'error', message: res.message, batchId: bId });
          setEngineStatus(EngineStatus.IDLE);
        }
      });

      return remaining;
    });
  }, [engineStatus, settings, engine, addLog]);

  const toggleEngine = () => {
    if (!user) return;
    if (engineStatus !== EngineStatus.IDLE) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setEngineStatus(EngineStatus.IDLE);
      setCountdown(null);
    } else {
      if (!settings.webhookUrl) return alert("Please setup your Bridge URL first.");
      if (pendingQueue.length === 0) return alert("Queue is empty.");
      setEngineStatus(EngineStatus.PROCESSING);
      processBatch();
    }
  };

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const t = setInterval(() => setCountdown(c => (c !== null ? c - 1 : null)), 1000);
      return () => clearInterval(t);
    }
  }, [countdown]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8 selection:bg-indigo-100 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-5 rounded-[2.5rem] border border-slate-200 shadow-sm gap-6">
          <div className="flex items-center space-x-4">
            <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-100">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-900 uppercase italic leading-none">SheetAuto V12</h1>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 italic">Smart Append & Dupe Protection</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
             {!user ? (
               <div className="flex items-center space-x-4">
                  <div className="googleBtnContainer" />
               </div>
             ) : (
               <div className="flex items-center space-x-3">
                  <div className="hidden md:flex items-center space-x-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    <img src={user.picture} className="w-6 h-6 rounded-full border border-slate-200" alt="avatar" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">{user.name}</span>
                  </div>
                  <button onClick={handleLogout} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all text-slate-400">
                    <LogOut className="w-4 h-4" />
                  </button>
               </div>
             )}
          </div>
        </header>

        {/* Locked Hero */}
        {!user && (
          <div className="bg-slate-900 rounded-[3rem] p-10 md:p-16 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none rotate-12"><Activity className="w-96 h-96" /></div>
            <div className="max-w-3xl relative z-10 space-y-8">
              <div className="inline-flex items-center space-x-2 px-4 py-1.5 bg-indigo-600/20 border border-indigo-500/30 rounded-full text-[10px] font-black uppercase tracking-widest text-indigo-400">
                 <ShieldCheck className="w-3.5 h-3.5" />
                 <span>Secure Batching Enabled</span>
              </div>
              <h2 className="text-5xl md:text-6xl font-black tracking-tighter uppercase italic leading-[0.9]">Zero <span className="text-indigo-500">Duplicate</span> URL Submission.</h2>
              <p className="text-lg text-slate-400 font-medium leading-relaxed">
                Our smart bridge script ensures that your data is always appended after the last row and automatically blocks URLs that already exist in your sheet.
              </p>
              <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center pt-4">
                 <div className="googleBtnContainer" />
                 <div className="h-10 w-px bg-white/10 hidden sm:block mx-4" />
                 <button onClick={() => setShowSetup(true)} className="flex items-center space-x-3 text-white hover:text-indigo-400 transition-colors font-black text-xs uppercase tracking-widest">
                    <Info className="w-5 h-5" />
                    <span>View Setup Logic</span>
                 </button>
              </div>
            </div>
          </div>
        )}

        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 transition-all duration-700 ${!user ? 'opacity-30 pointer-events-none blur-[2px]' : ''}`}>
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Clipboard className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">URL Input</h2>
                </div>
                <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest">Append Mode Active</div>
              </div>
              <textarea 
                className="w-full h-60 p-6 bg-slate-50 border border-slate-200 rounded-3xl focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-mono text-xs resize-none"
                placeholder="https://..."
                value={rawInput}
                onChange={e => setRawInput(e.target.value)}
              />
              <div className="flex gap-4">
                <button onClick={handleAddUrls} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs tracking-widest hover:bg-slate-800 transition-all shadow-xl flex items-center justify-center space-x-3">
                  <Layers className="w-4 h-4" />
                  <span>LOAD TO QUEUE</span>
                </button>
                <button onClick={() => setPendingQueue([])} className="px-6 py-4 bg-white border border-slate-200 text-slate-300 rounded-2xl hover:text-red-500">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[400px]">
               <div className="bg-slate-900 rounded-[2rem] overflow-hidden flex flex-col shadow-2xl">
                 <div className="px-6 py-4 bg-slate-800/50 flex items-center justify-between border-b border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-200">Bridge Transmission Log</span>
                    {countdown !== null && (
                      <div className="text-[10px] font-black text-indigo-400 flex items-center space-x-2 tabular-nums">
                        <Timer className="w-3.5 h-3.5" />
                        <span>NEXT BATCH: {Math.floor(countdown/60)}:{(countdown%60).toString().padStart(2,'0')}</span>
                      </div>
                    )}
                 </div>
                 <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-[9px]">
                   {logs.length === 0 ? <div className="h-full flex items-center justify-center text-slate-700 italic">SYSTEM READY...</div> : 
                    logs.map(log => (
                     <div key={log.id} className="flex items-center space-x-2 p-2 bg-white/5 border border-white/5 rounded-lg">
                        <span className="text-slate-500 shrink-0">[{log.timestamp.toLocaleTimeString()}]</span>
                        <span className={`px-1.5 py-0.5 rounded-[4px] text-[7px] font-black uppercase ${log.status === 'success' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-red-500/20 text-red-400'}`}>{log.status}</span>
                        <span className="text-slate-300 truncate flex-1">{log.url}</span>
                     </div>
                   ))}
                 </div>
               </div>
               <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden flex flex-col shadow-sm">
                 <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Next In Sequence</span>
                    <span className="text-[9px] font-black text-indigo-600 tracking-tighter">{pendingQueue.length} ITEMS WAITING</span>
                 </div>
                 <div className="flex-1 overflow-y-auto p-4 space-y-1.5 font-mono text-[9px]">
                    {pendingQueue.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-slate-200 space-y-3 uppercase tracking-widest">
                      <CheckCircle className="w-10 h-10 opacity-10" />
                      <span>Queue Clear</span>
                    </div> : 
                    pendingQueue.slice(0, 100).map((url, i) => (
                      <div key={i} className="flex items-center space-x-3 p-2 bg-slate-50 rounded-xl border border-slate-100">
                         <span className="text-indigo-400 font-black">#{i+1}</span>
                         <span className="text-slate-600 truncate">{url}</span>
                      </div>
                    ))}
                 </div>
               </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
               <div className="grid grid-cols-2 gap-8 relative z-10">
                 <div className="space-y-1">
                    <div className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">In Queue</div>
                    <div className="text-4xl font-black tabular-nums">{pendingQueue.length}</div>
                 </div>
                 <div className="space-y-1 border-l border-white/20 pl-8">
                    <div className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Processed</div>
                    <div className="text-4xl font-black tabular-nums text-emerald-300">{history.length}</div>
                 </div>
               </div>
               <div className="mt-8 bg-black/10 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-white h-full transition-all duration-700" style={{ width: `${progressPercent}%` }} />
               </div>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-6">
              <div className="flex items-center space-x-3">
                <Settings2 className="w-5 h-5 text-indigo-600" />
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Sequencer Settings</h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Bridge URL</label>
                  <input type="text" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none text-xs font-bold" placeholder="Paste Apps Script Web App URL" value={settings.webhookUrl} onChange={e => setSettings(s => ({ ...s, webhookUrl: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Sheet Name</label>
                  <input type="text" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none text-xs font-black" placeholder="Sheet1" value={settings.sheetName} onChange={e => setSettings(s => ({ ...s, sheetName: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Batch Size</label>
                    <input type="number" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black outline-none" value={settings.batchSize} onChange={e => setSettings(s => ({ ...s, batchSize: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Wait Time (m)</label>
                    <input type="number" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black outline-none" value={settings.intervalMinutes} onChange={e => setSettings(s => ({ ...s, intervalMinutes: parseInt(e.target.value) || 1 }))} />
                  </div>
                </div>
              </div>
              <button onClick={toggleEngine} className={`w-full py-5 rounded-2xl font-black text-xs tracking-widest transition-all shadow-xl flex items-center justify-center space-x-3 ${engineStatus !== EngineStatus.IDLE ? 'bg-red-500 text-white shadow-red-200' : 'bg-indigo-600 text-white shadow-indigo-200'}`}>
                {engineStatus !== EngineStatus.IDLE ? <><Pause className="w-5 h-5 fill-current" /><span>ABORT MISSION</span></> : <><Play className="w-5 h-5 fill-current" /><span>ENGAGE SEQUENCER</span></>}
              </button>
            </div>
          </div>
        </div>

        {/* Setup Modal */}
        {showSetup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
             <div className="bg-white rounded-[3rem] p-10 max-w-2xl w-full shadow-2xl relative space-y-8 max-h-[90vh] overflow-y-auto">
                <button onClick={() => setShowSetup(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-900 transition-colors">
                  <Trash2 className="w-6 h-6 rotate-45" />
                </button>
                <div className="flex items-center space-x-4">
                   <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600"><Key className="w-8 h-8" /></div>
                   <h2 className="text-2xl font-black tracking-tighter uppercase italic">Installation Guide</h2>
                </div>
                <div className="space-y-6 text-sm text-slate-600 font-medium leading-relaxed italic">
                   <p className="not-italic font-bold text-slate-900 underline underline-offset-4 decoration-indigo-500">Crucial: This script appends data after the last entry and checks for global duplicates.</p>
                   <ol className="space-y-4 list-decimal pl-5">
                      <li>Open your target Google Sheet.</li>
                      <li>Go to <b>Extensions &gt; Apps Script</b>.</li>
                      <li>Paste the code below (overwriting everything).</li>
                      <li>Click <b>Deploy &gt; New Deployment</b>.</li>
                      <li>Select <b>Web App</b>. Access: <b>Anyone</b>. Execute as: <b>Me</b>.</li>
                      <li>Paste the generated URL into "Bridge URL" on our site.</li>
                   </ol>
                   <div className="relative group">
                      <pre className="bg-slate-900 text-indigo-300 p-6 rounded-3xl text-[10px] overflow-x-auto font-mono border border-indigo-500/20">{BACKEND_CODE}</pre>
                      <button onClick={() => { navigator.clipboard.writeText(BACKEND_CODE); setCopied(true); setTimeout(()=>setCopied(false), 2000); }} className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center space-x-2 transition-all">
                        {copied ? <><Check className="w-3 h-3"/><span>Copied</span></> : <><Copy className="w-3 h-3"/><span>Copy Script</span></>}
                      </button>
                   </div>
                </div>
                <button onClick={() => setShowSetup(false)} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs tracking-widest uppercase shadow-xl hover:bg-slate-800 transition-all">I have deployed the script</button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
