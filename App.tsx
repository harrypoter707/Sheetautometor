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
      const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;  // Read from .env.local
      const redirectUri = process.env.REACT_APP_GOOGLE_REDIRECT_URI; // Read from .env.local

      // Initialize Google accounts login
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredentialResponse,
        redirect_uri: redirectUri,
      });

      document.querySelectorAll(".googleBtnContainer").forEach(container => {
        google.accounts.id.renderButton(container, {
          theme: "filled_blue",
          size: "large",
          width: 250,
          text: "continue_with"
        });
      });
    };

    if (typeof window !== 'undefined') {
      if (window.google) {
        initGoogle();
      } else {
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

        {/* Content Below */}
        {/* Add the remaining components and content */}
      </div>
    </div>
  );
};

export default App;
