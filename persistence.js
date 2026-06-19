// ============================================================
// persistence.js — localStorage + File System API + Supabase
// ============================================================

const SUPABASE_URL      = 'https://wkyixznsqdxgvoqudono.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndreWl4em5zcWR4Z3ZvcXVkb25vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjEyMjEsImV4cCI6MjA5NzM5NzIyMX0.oYGISjUZ__M4Ogyi6UuwX789Gxul2g2hApuCwzvxyls';

// 🔒 Troque para algo aleatório e atualize a policy no Supabase
const APP_SECRET = 'xK9#mP2$cV3-wQ7@zR';

const DB_NAME    = 'FileSystemDB';
const STORE_NAME = 'Handles';

let persistentFileHandle = null;
let supabaseOnline       = false;
let realtimeChannel      = null;

// ── Helpers Supabase ────────────────────────────────────────

function isSupabaseConfigured() {
    return !SUPABASE_URL.includes('SEU_PROJETO') && !SUPABASE_ANON_KEY.includes('SUA_ANON_KEY');
}

function supabaseHeaders() {
    return {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'x-app-secret':  APP_SECRET,
        'Prefer':        'return=minimal',
    };
}

function toRow(d) {
    return {
        id:           d.id,
        title:        d.title,
        developer:    d.developer    || null,
        description:  d.description  || null,
        deadline:     d.deadline     || null,
        quadrant:     d.quadrant,
        completed:    d.completed,
        archived:     d.archived,
        completed_at: d.completedAt  || null,
        tags:         JSON.stringify(d.tags || []),
        history:      JSON.stringify(d.history || []),
    };
}

function fromRow(r) {
    return {
        id:          r.id,
        title:       r.title,
        developer:   r.developer    || '',
        description: r.description  || '',
        deadline:    r.deadline     || null,
        quadrant:    r.quadrant,
        completed:   r.completed,
        archived:    r.archived,
        completedAt: r.completed_at || null,
        tags:        safeParseJSON(r.tags, []),
        history:     safeParseJSON(r.history, []),
    };
}

function safeParseJSON(val, fallback) {
    try { return val ? JSON.parse(val) : fallback; } catch { return fallback; }
}

async function supabaseFetchAll() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/demands?select=*&order=created_at.asc`,
        { headers: supabaseHeaders() }
    );
    if (!res.ok) throw new Error(`Supabase fetch: ${res.status}`);
    return (await res.json()).map(fromRow);
}

async function supabaseUpsertAll(demandList) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/demands`, {
        method:  'POST',
        headers: { ...supabaseHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body:    JSON.stringify(demandList.map(toRow)),
    });
    if (!res.ok) throw new Error(`Supabase upsert: ${res.status}`);
}

async function supabaseDeleteMissing(demandList) {
    if (demandList.length === 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/demands?id=neq.none`, {
            method: 'DELETE', headers: supabaseHeaders(),
        });
        return;
    }
    const ids = demandList.map(d => `"${d.id}"`).join(',');
    await fetch(`${SUPABASE_URL}/rest/v1/demands?id=not.in.(${ids})`, {
        method: 'DELETE', headers: supabaseHeaders(),
    });
}

// ── Realtime ────────────────────────────────────────────────

function initRealtime() {
    if (!isSupabaseConfigured() || realtimeChannel) return;

    // Usa WebSocket nativo do Supabase Realtime
    const wsUrl = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';
    const socket = new WebSocket(wsUrl);
    let heartbeat;

    socket.onopen = () => {
        // Autenticação e subscribe na tabela demands
        socket.send(JSON.stringify({ topic: 'realtime:public:demands', event: 'phx_join', payload: { user_token: SUPABASE_ANON_KEY }, ref: '1' }));
        heartbeat = setInterval(() => {
            socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: '2' }));
        }, 20000);
        realtimeChannel = socket;
        console.log('🔴 Realtime conectado');
    };

    socket.onmessage = async (e) => {
        const msg = JSON.parse(e.data);
        // Qualquer mudança na tabela dispara re-fetch
        if (msg.event === 'INSERT' || msg.event === 'UPDATE' || msg.event === 'DELETE') {
            try {
                const fresh = await supabaseFetchAll();
                demands = fresh;
                renderDemands();
                showToast('🔄 Dados atualizados em tempo real', 'info', 2000);
            } catch (err) {
                console.warn('Realtime fetch falhou:', err);
            }
        }
    };

    socket.onerror = () => console.warn('Realtime: erro de conexão');
    socket.onclose = () => {
        clearInterval(heartbeat);
        realtimeChannel = null;
        // Tenta reconectar após 5s
        setTimeout(initRealtime, 5000);
    };
}

// ── Indicador visual ────────────────────────────────────────

function updateBackupStatus(state) {
    const container = document.getElementById('backup-status-container');
    const text      = document.getElementById('backup-status-text');
    const btn       = document.getElementById('btn-reconnect-backup');
    if (!container) return;

    container.classList.remove('hidden');
    btn.classList.add('hidden');

    const map = {
        online:  `<i class="fa-solid fa-cloud text-indigo-500 mr-1"></i> Supabase: <span class="text-indigo-600 font-bold">ON</span>`,
        offline: `<i class="fa-solid fa-cloud-arrow-up text-amber-500 mr-1"></i> Supabase: <span class="text-amber-600 font-bold">Offline</span>`,
        file:    `<i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i> Auto-Save: <span class="text-emerald-600 font-bold">Arquivo</span>`,
        paused:  `<i class="fa-solid fa-circle-exclamation text-amber-500 mr-1"></i> Auto-Save: <span class="text-gray-500 font-bold">Pausado</span>`,
        local:   `<i class="fa-solid fa-floppy-disk text-gray-400 mr-1"></i> Salvo: <span class="text-gray-500 font-bold">Local</span>`,
    };
    text.innerHTML = map[state] || map.local;
    if (state === 'paused') btn.classList.remove('hidden');
}

// ── updateApp ───────────────────────────────────────────────

async function updateApp() {
    localStorage.setItem('my_demands', JSON.stringify(demands));

    if (persistentFileHandle) await saveDemandsToFile(persistentFileHandle);

    if (isSupabaseConfigured()) {
        try {
            await supabaseUpsertAll(demands);
            await supabaseDeleteMissing(demands);
            supabaseOnline = true;
            updateBackupStatus('online');
        } catch (err) {
            supabaseOnline = false;
            updateBackupStatus('offline');
            console.error('Erro Supabase:', err);
        }
    } else if (!persistentFileHandle) {
        updateBackupStatus('local');
    }

    renderDemands();
}

// ── IndexedDB ───────────────────────────────────────────────

async function storeHandle(handle) {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
    req.onsuccess = (e) => {
        e.target.result
            .transaction(STORE_NAME, 'readwrite')
            .objectStore(STORE_NAME)
            .put(handle, 'backup_file');
    };
}

async function getStoredHandle() {
    return new Promise((resolve) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
        req.onsuccess = (e) => {
            const get = e.target.result
                .transaction(STORE_NAME, 'readonly')
                .objectStore(STORE_NAME)
                .get('backup_file');
            get.onsuccess = () => resolve(get.result);
            get.onerror   = () => resolve(null);
        };
        req.onerror = () => resolve(null);
    });
}

// ── File System API ─────────────────────────────────────────

async function saveDemandsToFile(handle) {
    if (!handle) return;
    try {
        if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
            updateBackupStatus('paused'); return;
        }
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(demands, null, 2));
        await writable.close();
        if (!supabaseOnline) updateBackupStatus('file');
    } catch (err) {
        console.error('Erro no auto-save:', err);
        updateBackupStatus('paused');
    }
}

async function requestFilePermission() {
    if (!persistentFileHandle) return;
    if (await persistentFileHandle.requestPermission({ mode: 'readwrite' }) === 'granted') {
        if (!supabaseOnline) updateBackupStatus('file');
        await updateApp();
    }
}

async function exportData() {
    if (!window.showSaveFilePicker) {
        const blob = new Blob([JSON.stringify(demands, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: 'backup_matriz.json' });
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        return;
    }
    try {
        if (!persistentFileHandle) {
            persistentFileHandle = await window.showSaveFilePicker({
                suggestedName: 'backup_matriz.json',
                types: [{ description: 'Backup da Matriz', accept: { 'application/json': ['.json'] } }],
            });
            await storeHandle(persistentFileHandle);
        }
        await saveDemandsToFile(persistentFileHandle);
        showToast('✅ Backup salvo com sucesso!');
    } catch (err) {
        if (err.name !== 'AbortError') showToast('Não foi possível acessar o arquivo.', 'error');
    }
}

async function importData() {
    if (!window.showOpenFilePicker) {
        showToast('Use Chrome ou Edge para importar arquivos.', 'warning'); return;
    }
    try {
        const [fileHandle] = await window.showOpenFilePicker({
            types: [{ description: 'Demandas JSON', accept: { 'application/json': ['.json'] } }],
            multiple: false,
        });
        showConfirm(`Conectar "${fileHandle.name}"? Os dados atuais serão substituídos.`, async () => {
            let perm = await fileHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') perm = await fileHandle.requestPermission({ mode: 'readwrite' });
            persistentFileHandle = fileHandle;
            await storeHandle(fileHandle);
            await loadDemandsFromFile(persistentFileHandle);
            await updateApp();
            showToast(`✅ "${fileHandle.name}" conectado para auto-save!`);
        });
    } catch (err) {
        if (err.name !== 'AbortError') showToast('Falha ao importar arquivo.', 'error');
    }
}

async function loadDemandsFromFile(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    demands = JSON.parse(text).map(d => ({
        archived: false, description: '', completedAt: null, tags: [], history: [], ...d,
    }));
}
