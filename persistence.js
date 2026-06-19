// ============================================================
// persistence.js — localStorage + File System API + Supabase
// ============================================================

// ⚠️ Preencha com os dados do seu projeto em supabase.com
// Settings → API → Project URL e anon public key
const SUPABASE_URL      = 'https://wkyixznsqdxgvoqudono.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndreWl4em5zcWR4Z3ZvcXVkb25vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjEyMjEsImV4cCI6MjA5NzM5NzIyMX0.oYGISjUZ__M4Ogyi6UuwX789Gxul2g2hApuCwzvxyls';

const DB_NAME    = 'FileSystemDB';
const STORE_NAME = 'Handles';

let persistentFileHandle = null;
let supabaseOnline       = false;

// ── Helpers Supabase (fetch puro, sem SDK) ──────────────────

function isSupabaseConfigured() {
    return !SUPABASE_URL.includes('SEU_PROJETO') && !SUPABASE_ANON_KEY.includes('SUA_ANON_KEY');
}

function supabaseHeaders() {
    return {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer':        'return=minimal',
    };
}

function toRow(d) {
    return {
        id:           d.id,
        title:        d.title,
        developer:    d.developer   || null,
        description:  d.description || null,
        deadline:     d.deadline    || null,
        quadrant:     d.quadrant,
        completed:    d.completed,
        archived:     d.archived,
        completed_at: d.completedAt || null,
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
    };
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

// ── Indicador visual de backup ──────────────────────────────

function updateBackupStatus(state) {
    // state: 'online' | 'offline' | 'file' | 'paused' | 'local'
    const container = document.getElementById('backup-status-container');
    const text      = document.getElementById('backup-status-text');
    const btn       = document.getElementById('btn-reconnect-backup');
    if (!container) return;

    container.classList.remove('hidden'); // garante que sempre aparece
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

// ── updateApp: ponto central de persistência + render ───────

async function updateApp() {
    // 1. localStorage sempre (fallback imediato)
    localStorage.setItem('my_demands', JSON.stringify(demands));

    // 2. Arquivo local se conectado
    if (persistentFileHandle) await saveDemandsToFile(persistentFileHandle);

    // 3. Supabase se configurado
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
        // Sem Supabase e sem arquivo: só localStorage
        updateBackupStatus('local');
    }

    renderDemands();
}

// ── IndexedDB: persiste o file handle ──────────────────────

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
            updateBackupStatus('paused');
            return;
        }
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(demands, null, 2));
        await writable.close();
        if (!supabaseOnline) updateBackupStatus('file');
    } catch (err) {
        console.error('Erro no auto-save do arquivo:', err);
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
        alert('✅ Backup fixado e salvo com sucesso!');
    } catch (err) {
        if (err.name !== 'AbortError') alert('Não foi possível acessar o arquivo de backup.');
    }
}

async function importData() {
    if (!window.showOpenFilePicker) {
        alert('Seu navegador não suporta a File System Access API. Use Chrome ou Edge.');
        return;
    }
    try {
        const [fileHandle] = await window.showOpenFilePicker({
            types: [{ description: 'Demandas JSON', accept: { 'application/json': ['.json'] } }],
            multiple: false,
        });
        if (!confirm(`Conectar "${fileHandle.name}" para salvamento automático? Os dados atuais serão substituídos.`)) return;

        let perm = await fileHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') perm = await fileHandle.requestPermission({ mode: 'readwrite' });

        persistentFileHandle = fileHandle;
        await storeHandle(fileHandle);
        await loadDemandsFromFile(persistentFileHandle);
        await updateApp();
        alert(`✅ Backup Automático Ativado!\n"${fileHandle.name}" será atualizado a cada mudança.`);
    } catch (err) {
        if (err.name !== 'AbortError') alert('Falha ao importar. Verifique as permissões ou o formato do arquivo.');
    }
}

async function loadDemandsFromFile(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    demands = JSON.parse(text).map(d => ({ archived: false, description: '', completedAt: null, ...d }));
}