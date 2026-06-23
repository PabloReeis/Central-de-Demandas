// ============================================================
// queue.js — Fila de Entrada com Supabase
// ============================================================

let entryQueue   = [];
let queueSystems = [];

// ── Helpers Supabase ─────────────────────────────────────────

function queueHeaders() {
    return {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'x-app-secret':  APP_SECRET,
        'Prefer':        'return=minimal',
    };
}

async function sbFetch(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: queueHeaders() });
    if (!res.ok) throw new Error(`Supabase GET ${path}: ${res.status}`);
    return res.json();
}

async function sbPost(table, body, prefer = 'return=minimal') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...queueHeaders(), 'Prefer': prefer },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase POST ${table}: ${res.status}`);
}

async function sbDelete(table, filter) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method: 'DELETE', headers: queueHeaders(),
    });
    if (!res.ok) throw new Error(`Supabase DELETE ${table}: ${res.status}`);
}

// ── Carregar dados do Supabase ────────────────────────────────

async function loadQueueFromSupabase() {
    try {
        const [systems, queue] = await Promise.all([
            sbFetch('queue_systems?select=*&order=position.asc,created_at.asc'),
            sbFetch('entry_queue?select=*&order=created_at.asc'),
        ]);
        queueSystems = systems.map(s => s.name);
        entryQueue   = queue.map(q => ({
            id:          q.id,
            title:       q.title,
            system:      q.system,
            developer:   q.developer   || null,
            description: q.description || null,
            deadline:    q.deadline    || null,
            createdAt:   q.created_day || '',
        }));
        // Fallback para localStorage
        localStorage.setItem(QUEUE_KEY,   JSON.stringify(entryQueue));
        localStorage.setItem(SYSTEMS_KEY, JSON.stringify(queueSystems));
    } catch (err) {
        console.warn('Supabase indisponível, usando localStorage:', err);
        entryQueue   = JSON.parse(localStorage.getItem(QUEUE_KEY)   || '[]');
        queueSystems = JSON.parse(localStorage.getItem(SYSTEMS_KEY) || '[]');
    }
    renderSystemList();
    renderQueueSystemSelect();
    renderQueueView();
    updateQueueBadge();
}

// ── Persistência local (fallback) ─────────────────────────────

const QUEUE_KEY   = 'my_entry_queue';
const SYSTEMS_KEY = 'my_queue_systems';

function saveQueueLocal() {
    localStorage.setItem(QUEUE_KEY,   JSON.stringify(entryQueue));
    localStorage.setItem(SYSTEMS_KEY, JSON.stringify(queueSystems));
    updateQueueBadge();
}

function updateQueueBadge() {
    const badge = document.getElementById('queue-tab-count');
    if (!badge) return;
    badge.textContent = entryQueue.length;
    badge.classList.toggle('hidden', entryQueue.length === 0);
}

// ── Controle de abas ─────────────────────────────────────────

function switchTab(tab) {
    ['matrix', 'queue'].forEach(t => {
        document.getElementById(`view-${t}`)?.classList.toggle('hidden', t !== tab);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) {
            btn.className = `tab-btn ${t === tab ? 'tab-active' : 'tab-inactive'} text-xs font-semibold px-4 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5`;
        }
    });
    if (tab === 'queue') {
        if (isSupabaseConfigured()) loadQueueFromSupabase();
        else renderQueueView();
    }
}

// ── Gerenciar Sistemas ────────────────────────────────────────

document.getElementById('system-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-system-name');
    const name  = input.value.trim();
    if (!name) return;
    if (queueSystems.some(s => s.toLowerCase() === name.toLowerCase())) {
        showToast('Sistema já existe!', 'warning'); return;
    }

    try {
        if (isSupabaseConfigured()) {
            await sbPost('queue_systems', { id: Date.now().toString(), name, position: queueSystems.length });
        }
        queueSystems.push(name);
        saveQueueLocal();
        renderSystemList();
        renderQueueSystemSelect();
        input.value = '';
        input.focus();
        showToast(`Sistema "${name}" adicionado!`);
    } catch (err) {
        console.error(err);
        showToast('Erro ao salvar sistema.', 'error');
    }
});

async function deleteSystem(name) {
    const hasItems = entryQueue.some(q => q.system === name);
    const doDelete = async () => {
        try {
            if (isSupabaseConfigured()) {
                // entry_queue em cascata via FK, mas removemos explicitamente por segurança
                await sbDelete('entry_queue',   `system=eq.${encodeURIComponent(name)}`);
                await sbDelete('queue_systems', `name=eq.${encodeURIComponent(name)}`);
            }
            queueSystems = queueSystems.filter(s => s !== name);
            entryQueue   = entryQueue.filter(q => q.system !== name);
            saveQueueLocal();
            renderSystemList(); renderQueueSystemSelect(); renderQueueView();
            showToast(`Sistema "${name}" removido.`, 'error');
        } catch (err) {
            console.error(err);
            showToast('Erro ao remover sistema.', 'error');
        }
    };

    if (hasItems) {
        showConfirm(`"${name}" tem demandas na fila. Excluir tudo?`, doDelete);
    } else {
        doDelete();
    }
}

function renderSystemList() {
    const ul = document.getElementById('system-list');
    if (!ul) return;
    if (queueSystems.length === 0) {
        ul.innerHTML = `<li class="text-[11px] text-gray-400 italic text-center py-2">Nenhum sistema cadastrado.</li>`;
        return;
    }
    ul.innerHTML = queueSystems.map(name => {
        const count = entryQueue.filter(q => q.system === name).length;
        return `
            <li class="flex items-center justify-between px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                <span class="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                    <i class="fa-solid fa-folder text-indigo-400 text-[10px]"></i> ${name}
                    ${count > 0 ? `<span class="text-[9px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">${count}</span>` : ''}
                </span>
                <button onclick="deleteSystem('${name.replace(/'/g, "\\'")}')"
                        class="text-gray-300 hover:text-red-500 p-1 cursor-pointer transition" title="Remover">
                    <i class="fa-solid fa-xmark text-xs"></i>
                </button>
            </li>`;
    }).join('');
}

function renderQueueSystemSelect() {
    const sel = document.getElementById('queue-system');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Selecione o sistema...</option>' +
        queueSystems.map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join('');
}

// ── Formulário de demanda ─────────────────────────────────────

document.getElementById('queue-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title    = document.getElementById('queue-title').value.trim();
    const system   = document.getElementById('queue-system').value;
    const dev      = document.getElementById('queue-developer').value.trim();
    const desc     = document.getElementById('queue-desc').value.trim();
    const deadline = document.getElementById('queue-deadline').value || null;

    if (!title || !system) { showToast('Preencha o código e o sistema!', 'warning'); return; }
    if (entryQueue.some(q => q.system === system && q.title.toLowerCase() === title.toLowerCase())) {
        showToast('Essa demanda já está na fila desse sistema!', 'warning'); return;
    }

    const createdAt = new Date().toLocaleDateString('pt-BR').substring(0, 5);
    const id        = Date.now().toString();

    try {
        if (isSupabaseConfigured()) {
            await sbPost('entry_queue', {
                id, title, system,
                developer:   dev      || null,
                description: desc     || null,
                deadline:    deadline || null,
                created_day: createdAt,
            });
        }
        entryQueue.push({ id, title, system, developer: dev || null, description: desc || null, deadline, createdAt });
        saveQueueLocal();
        renderQueueView();
        renderSystemList();
        showToast('Adicionado à fila!');

        document.getElementById('queue-title').value    = '';
        document.getElementById('queue-desc').value     = '';
        document.getElementById('queue-deadline').value = '';
        document.getElementById('queue-title').focus();
    } catch (err) {
        console.error(err);
        showToast('Erro ao salvar na fila.', 'error');
    }
});

// ── Aprovar → Q2 da Matriz ────────────────────────────────────

async function approveQueueItem(id) {
    const item = entryQueue.find(q => q.id === id);
    if (!item) return;

    if (demands.some(d => !d.archived && d.title.toLowerCase() === item.title.toLowerCase())) {
        showToast('Essa demanda já existe na matriz!', 'warning'); return;
    }

    demands.push({
        id:          Date.now().toString(),
        title:       item.title,
        developer:   item.developer   || '',
        description: item.description || '',
        deadline:    item.deadline    || null,
        quadrant:    'q2',
        completed:   false, archived: false, completedAt: null,
        tags:        [],
        history: [{
            date: new Date().toLocaleDateString('pt-BR').substring(0, 5),
            from: null, to: 'q2',
            note: `Aprovada da Fila — ${item.system}`,
        }],
    });

    try {
        if (isSupabaseConfigured()) {
            await sbDelete('entry_queue', `id=eq.${id}`);
        }
        entryQueue = entryQueue.filter(q => q.id !== id);
        saveQueueLocal();
        renderQueueView();
        renderSystemList();
        await updateApp();
        showToast(`✅ "${item.title}" aprovada e enviada para Q2!`);
    } catch (err) {
        console.error(err);
        showToast('Erro ao aprovar demanda.', 'error');
    }
}

// ── Remover da fila ───────────────────────────────────────────

function rejectQueueItem(id) {
    const item = entryQueue.find(q => q.id === id);
    if (!item) return;
    showConfirm(`Remover "${item.title}" da fila?`, async () => {
        try {
            if (isSupabaseConfigured()) {
                await sbDelete('entry_queue', `id=eq.${id}`);
            }
            entryQueue = entryQueue.filter(q => q.id !== id);
            saveQueueLocal();
            renderQueueView();
            renderSystemList();
            showToast('Removida da fila.', 'error');
        } catch (err) {
            console.error(err);
            showToast('Erro ao remover.', 'error');
        }
    });
}

// ── Renderização agrupada por sistema ─────────────────────────

function renderQueueView() {
    const groups  = document.getElementById('queue-groups');
    const counter = document.getElementById('queue-list-count');
    const search  = (document.getElementById('queue-search')?.value || '').toLowerCase().trim();
    if (!groups) return;

    if (counter) counter.textContent = entryQueue.length;
    updateQueueBadge();

    const filtered = entryQueue.filter(q =>
        !search ||
        q.title.toLowerCase().includes(search) ||
        q.system.toLowerCase().includes(search) ||
        (q.developer || '').toLowerCase().includes(search)
    );

    const grouped = {};
    queueSystems.forEach(s => { grouped[s] = []; });
    filtered.forEach(q => {
        if (!grouped[q.system]) grouped[q.system] = [];
        grouped[q.system].push(q);
    });

    const activeSystems = queueSystems.filter(s => grouped[s]?.length > 0);

    if (activeSystems.length === 0) {
        groups.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-16 text-gray-400">
                <i class="fa-solid fa-inbox text-4xl mb-3 opacity-30"></i>
                <p class="text-sm font-medium">${entryQueue.length === 0 ? 'Fila vazia' : 'Nenhum resultado'}</p>
                <p class="text-xs mt-1">${queueSystems.length === 0 ? 'Cadastre sistemas no painel ao lado.' : 'Adicione demandas pelo formulário.'}</p>
            </div>`;
        return;
    }

    groups.innerHTML = activeSystems.map(system => {
        const items = grouped[system];
        const rows  = items.map((item, idx) => {
            const icon          = getJiraIcon(item.title);
            const deadlineBadge = item.deadline ? getDeadlineBadge(item.deadline, false) : '';
            const devLabel      = item.developer
                ? `<span class="text-[10px] text-gray-400 flex items-center gap-0.5"><i class="fa-solid fa-user text-[9px]"></i>${item.developer}</span>`
                : '';
            const descLabel = item.description
                ? `<p class="text-[10px] text-gray-400 truncate mt-0.5">${item.description}</p>`
                : '';
            return `
                <div class="flex items-start gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50 hover:border-indigo-200 hover:bg-indigo-50/30 transition group">
                    <span class="text-[10px] font-bold text-gray-300 w-4 pt-0.5 shrink-0">${idx + 1}</span>
                    <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap items-center gap-1">
                            <span class="text-xs font-mono font-semibold text-gray-800">${icon}${item.title}</span>
                            ${deadlineBadge}
                        </div>
                        <div class="flex flex-wrap items-center gap-2 mt-0.5">
                            ${devLabel}
                            <span class="text-[9px] text-gray-300">Entrou ${item.createdAt}</span>
                        </div>
                        ${descLabel}
                    </div>
                    <div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                        <button onclick="approveQueueItem('${item.id}')"
                                class="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-lg font-medium cursor-pointer flex items-center gap-1"
                                title="Aprovar e enviar para Q2">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <button onclick="rejectQueueItem('${item.id}')"
                                class="text-gray-300 hover:text-red-500 p-1 rounded cursor-pointer"
                                title="Remover">
                            <i class="fa-solid fa-xmark text-xs"></i>
                        </button>
                    </div>
                </div>`;
        }).join('');

        return `
            <div class="bg-white rounded-xl border-t-4 border-t-indigo-400 border-x border-b border-gray-200 shadow-xs overflow-hidden">
                <div class="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <h3 class="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                        <i class="fa-solid fa-folder text-indigo-400 text-xs"></i> ${system}
                    </h3>
                    <span class="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">${items.length}</span>
                </div>
                <div class="p-3 flex flex-col gap-1.5">${rows}</div>
            </div>`;
    }).join('');
}

// ── Init ──────────────────────────────────────────────────────

if (isSupabaseConfigured()) {
    loadQueueFromSupabase();
} else {
    entryQueue   = JSON.parse(localStorage.getItem(QUEUE_KEY)   || '[]');
    queueSystems = JSON.parse(localStorage.getItem(SYSTEMS_KEY) || '[]');
    renderSystemList();
    renderQueueSystemSelect();
    updateQueueBadge();
}
