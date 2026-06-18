// ============================================================
// persistence.js — Salvamento local, arquivo e Google Sheets
// ============================================================

const DB_NAME    = 'FileSystemDB';
const STORE_NAME = 'Handles';
const SHEET_API_URL = 'https://sheetdb.io/api/v1/SUA_API_ID';

let persistentFileHandle = null;

// --- IndexedDB: guarda o file handle entre recarregamentos ---
async function storeHandle(handle) {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
    request.onsuccess = (e) => {
        const db = e.target.result;
        db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(handle, 'backup_file');
    };
}

async function getStoredHandle() {
    return new Promise((resolve) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
        request.onsuccess = (e) => {
            const db  = e.target.result;
            const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get('backup_file');
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => resolve(null);
        };
        request.onerror = () => resolve(null);
    });
}

// --- Status do backup na sidebar ---
function updateBackupStatus(active) {
    const container = document.getElementById('backup-status-container');
    const text      = document.getElementById('backup-status-text');
    const btn       = document.getElementById('btn-reconnect-backup');

    container.classList.remove('hidden');
    if (active) {
        text.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i> Auto-Save: ON`;
        text.classList.replace('text-gray-400', 'text-emerald-600');
        btn.classList.add('hidden');
    } else {
        text.innerHTML = `<i class="fa-solid fa-circle-exclamation text-amber-500 mr-1"></i> Auto-Save: Pausado`;
        text.classList.replace('text-emerald-600', 'text-gray-400');
        btn.classList.remove('hidden');
    }
}

// --- Salva no arquivo vinculado ---
async function saveDemandsToFile(handle) {
    if (!handle) return;
    try {
        if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
            updateBackupStatus(false);
            return;
        }
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(demands, null, 2));
        await writable.close();
        updateBackupStatus(true);
    } catch (err) {
        console.error('Erro no auto-save:', err);
        updateBackupStatus(false);
    }
}

async function requestFilePermission() {
    if (!persistentFileHandle) return;
    if (await persistentFileHandle.requestPermission({ mode: 'readwrite' }) === 'granted') {
        updateBackupStatus(true);
        await updateApp();
    }
}

// --- Exportar backup ---
async function exportData() {
    if (!window.showSaveFilePicker) {
        const blob = new Blob([JSON.stringify(demands, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: 'backup_matriz.json' });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
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

// --- Importar / conectar arquivo ---
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

        let permission = await fileHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') permission = await fileHandle.requestPermission({ mode: 'readwrite' });

        persistentFileHandle = fileHandle;
        await storeHandle(fileHandle);
        await loadDemandsFromFile(persistentFileHandle);
        await updateApp();
        alert(`✅ Backup Automático Ativado!\n"${fileHandle.name}" será atualizado a cada mudança.`);
        updateBackupStatus(true);
    } catch (err) {
        if (err.name !== 'AbortError') alert('Falha ao importar. Verifique as permissões ou o formato do arquivo.');
    }
}

async function loadDemandsFromFile(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    demands = JSON.parse(text).map(d => ({
        archived: false, description: '', completedAt: null, ...d,
    }));
}

// --- updateApp: ponto central de persistência + render ---
async function updateApp() {
    localStorage.setItem('my_demands', JSON.stringify(demands));

    if (persistentFileHandle) await saveDemandsToFile(persistentFileHandle);

    if (SHEET_API_URL && !SHEET_API_URL.includes('SUA_API_ID')) {
        try {
            await fetch(SHEET_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: demands }),
            });
        } catch (err) {
            console.error('Erro ao sincronizar com Google Sheets:', err);
        }
    }

    renderDemands();
}
