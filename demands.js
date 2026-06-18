// ============================================================
// demands.js — CRUD, renderização, drag-drop e estatísticas
// ============================================================

let demands = [];

// ── Utilitários ─────────────────────────────────────────────

function getJiraIcon(title) {
    const upper = title.toUpperCase();
    if (/^(DEVCOJIN3-|CDNCOJIN3-)/.test(upper))
        return '<i class="fa-solid fa-bolt text-purple-500 mr-1.5" title="Desenvolvimento/Jira"></i>';
    if (/^CH\d+/.test(upper) || upper.startsWith('CHAMADO'))
        return '<i class="fa-solid fa-bug text-red-500 mr-1.5" title="Chamado"></i>';
    return '<i class="fa-solid fa-circle-nodes text-gray-400 mr-1.5"></i>';
}

function getDeadlineBadge(deadlineStr, isCompleted) {
    if (!deadlineStr) return '';
    const deadlineDate = new Date(deadlineStr + 'T23:59:59');
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const [ano, mes, dia] = deadlineStr.split('-');
    const fmt = `${dia}/${mes}`;

    if (isCompleted)
        return `<span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md"><i class="fa-regular fa-calendar"></i> ${fmt}</span>`;
    if (deadlineDate < today)
        return `<span class="text-[10px] bg-red-100 text-red-700 font-semibold px-1.5 py-0.5 rounded-md border border-red-200 animate-pulse">⚠️ Venceu ${fmt}</span>`;
    if (deadlineDate.toDateString() === today.toDateString())
        return `<span class="text-[10px] bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-md border border-amber-200">🕒 Hoje</span>`;
    return `<span class="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md border border-emerald-100">📅 Até ${fmt}</span>`;
}

function extractDevName(demand) {
    let dev = (demand.developer || '').trim();
    if (!dev) {
        const pattern = /(?:Passar\s+(?:pro|a)\s+)([A-Za-zÀ-ú\s]+)/i;
        const match   = demand.title.match(pattern) || (demand.description && demand.description.match(pattern));
        if (match) dev = match[1].trim();
    }
    return dev;
}

// ── CRUD ────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputTitle = taskTitleInput.value.trim();
    if (demands.some(d => !d.archived && d.title.toLowerCase() === inputTitle.toLowerCase())) {
        alert(`⚠️ A demanda "${inputTitle}" já existe na sua matriz!`);
        return;
    }
    demands.push({
        id: Date.now().toString(),
        title: inputTitle,
        developer: taskDeveloperInput.value.trim(),
        description: taskDescInput.value.trim(),
        deadline: taskDeadlineInput.value || null,
        quadrant: taskQuadrantSelect.value,
        completed: false, archived: false, completedAt: null,
    });
    taskTitleInput.value = taskDeveloperInput.value = taskDescInput.value = taskDeadlineInput.value = '';
    updateApp();
});

async function enviarFilaSuporte(e) {
    e.preventDefault();
    const input = document.getElementById('support-task-title');
    const title = input.value.trim();
    if (!title) return;
    if (demands.some(d => !d.archived && d.title.toLowerCase() === title.toLowerCase())) {
        alert(`A demanda "${title}" já existe!`);
        return;
    }
    demands.push({
        id: Date.now().toString(), title,
        description: '', deadline: null, quadrant: 'support_inbox',
        completed: false, archived: false, completedAt: null,
    });
    input.value = '';
    await updateApp();
}
document.getElementById('support-form').addEventListener('submit', enviarFilaSuporte);

function toggleComplete(id, fromWorkload = false) {
    demands = demands.map(item => {
        if (item.id === id) {
            item.completed  = !item.completed;
            item.completedAt = item.completed ? new Date().toLocaleDateString('pt-BR').substring(0, 5) : null;
            if (fromWorkload && item.completed)  item.archived = true;
            if (fromWorkload && !item.completed) item.archived = false;
        }
        return item;
    });
    updateApp();
}

function deleteDemand(id) {
    if (!confirm('Excluir permanentemente esta demanda?')) return;
    demands = demands.filter(d => d.id !== id);
    if (expandedTaskId === id) expandedTaskId = null;
    updateApp();
}

function limparDemandasConcluidas() {
    const completedActive = demands.filter(d => d.completed && !d.archived);
    if (completedActive.length === 0) return;
    demands = demands.map(d => { if (d.completed) d.archived = true; return d; });
    updateApp();
}

function unarchiveDemand(id) {
    demands = demands.map(d => {
        if (d.id === id) { d.archived = false; d.completed = false; d.completedAt = null; }
        return d;
    });
    updateApp();
}

// ── Drag & Drop ─────────────────────────────────────────────

function initDragAndDrop() {
    ['list-support_inbox', 'list-q1', 'list-q2', 'list-q3', 'list-q4'].forEach(listId => {
        const el = document.getElementById(listId);
        if (!el || el.sortableInstance) return;
        el.sortableInstance = new Sortable(el, {
            group: 'shared_quadrants',
            animation: 150,
            ghostClass: 'sortable-ghost',
            filter: 'input, button, .empty-placeholder',
            preventOnFilter: false,
            onEnd(evt) {
                const newQuadrant = evt.to.getAttribute('data-quadrant');
                const taskId      = evt.item.getAttribute('data-id');
                if (!newQuadrant || !taskId) return;
                demands = demands.map(t => { if (t.id === taskId) t.quadrant = newQuadrant; return t; });
                updateApp();
            },
        });
    });
}

// ── Renderização principal ───────────────────────────────────

function renderDemands() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const quadrants  = { support_inbox: [], q1: [], q2: [], q3: [], q4: [] };
    const archivedList = [];
    const todayStr   = new Date().toISOString().split('T')[0];

    let stats = { overdue: 0, today: 0, onTime: 0, totalActive: 0, completedActive: 0 };
    let dailyCompletedCount = 0;
    let systemCounts  = {};
    let teamWorkload  = {};

    Object.keys(quadrants).forEach(q => {
        const el = document.getElementById(`list-${q}`);
        if (el) el.innerHTML = '';
    });

    demands.forEach(demand => {
        const systemMatch       = demand.title.match(/\[(.*?)\]/);
        const sysName           = systemMatch ? systemMatch[1].trim() : 'Geral';
        const currentSystemName = systemMatch ? systemMatch[1].trim() : null;
        const jiraMatch         = demand.title.match(/^([A-Z0-9\-]+)/);
        const jiraCode          = jiraMatch ? jiraMatch[1].trim() : demand.title.substring(0, 15);
        const devName           = extractDevName(demand);

        // Carga de trabalho
        if (devName && devName.length > 2) {
            if (!teamWorkload[sysName]) teamWorkload[sysName] = {};
            if (!teamWorkload[sysName][devName]) teamWorkload[sysName][devName] = { totalCount: 0, activeCards: [] };
            teamWorkload[sysName][devName].totalCount++;
            if (!demand.completed && !demand.archived)
                teamWorkload[sysName][devName].activeCards.push({ id: demand.id, title: jiraCode });
        }

        if (demand.archived) {
            archivedList.push(demand);
            return;
        }

        stats.totalActive++;
        if (demand.completed) { dailyCompletedCount++; stats.completedActive++; }

        if (currentSystemName)
            systemCounts[currentSystemName] = (systemCounts[currentSystemName] || 0) + 1;

        if (demand.deadline && !demand.completed) {
            if      (demand.deadline < todayStr)   stats.overdue++;
            else if (demand.deadline === todayStr)  stats.today++;
            else                                    stats.onTime++;
        } else if (!demand.completed) {
            stats.onTime++;
        }

        if (!demand.title.toLowerCase().includes(searchTerm)) return;
        let matches = true;
        if (currentStatusFilter === 'pending'   &&  demand.completed) matches = false;
        if (currentStatusFilter === 'completed' && !demand.completed) matches = false;
        if (selectedSystemFilter && (!systemMatch || systemMatch[1].trim() !== selectedSystemFilter)) matches = false;
        if (matches) quadrants[demand.quadrant].push(demand);
    });

    // Atualiza indicadores
    document.getElementById('side-count-overdue').innerText  = stats.overdue;
    document.getElementById('side-count-today').innerText    = stats.today;
    document.getElementById('side-count-on-time').innerText  = stats.onTime;
    document.getElementById('archive-count').innerText       = archivedList.length;
    document.getElementById('daily-btn-count').innerText     = dailyCompletedCount;

    const rate = stats.totalActive > 0 ? Math.round((stats.completedActive / stats.totalActive) * 100) : 0;
    document.getElementById('side-completion-rate').innerText = `${rate}%`;
    document.getElementById('progress-bar-fill').style.width  = `${rate}%`;

    renderSystemFilter(systemCounts);
    renderTeamWorkload(teamWorkload);
    renderQuadrants(quadrants);
    renderArchiveList(archivedList);
    initDragAndDrop();
    renderScratchpadIdeas();
}

// ── Sub-renders ──────────────────────────────────────────────

function renderSystemFilter(systemCounts) {
    const listEl    = document.getElementById('system-counters-list');
    const clearBtn  = document.getElementById('btn-clear-system-filter');
    const indicator = document.getElementById('active-system-indicator');
    const nameEl    = document.getElementById('active-system-name');

    if (Object.keys(systemCounts).length === 0) {
        listEl.innerHTML = `<span class="text-[11px] text-gray-400 italic">Nenhum sistema detectado...</span>`;
        clearBtn.classList.add('hidden');
        indicator.classList.add('hidden');
        return;
    }

    listEl.innerHTML = '';
    if (selectedSystemFilter) {
        clearBtn.classList.remove('hidden');
        indicator.classList.remove('hidden');
        nameEl.innerText = `[${selectedSystemFilter}]`;
    } else {
        clearBtn.classList.add('hidden');
        indicator.classList.add('hidden');
    }

    Object.keys(systemCounts).sort().forEach(sys => {
        const isSelected = selectedSystemFilter === sys;
        const btn = document.createElement('button');
        btn.onclick = () => filterBySystem(isSelected ? null : sys);
        btn.className = `flex justify-between items-center px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer border ${
            isSelected ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-3xs'
                       : 'bg-gray-50 border-gray-150 text-gray-700 hover:bg-gray-100'}`;
        btn.innerHTML = `
            <span class="truncate"><i class="fa-solid fa-cube text-[10px] opacity-60 mr-1"></i> [${sys}]</span>
            <span class="bg-gray-200 text-gray-800 text-[9px] px-1.5 py-0.2 rounded-full font-bold">${systemCounts[sys]}</span>`;
        listEl.appendChild(btn);
    });
}

function renderTeamWorkload(teamWorkload) {
    const el = document.getElementById('team-workload-list');
    if (!el) return;
    const systems = Object.keys(teamWorkload).sort();
    if (systems.length === 0) {
        el.innerHTML = `<span class="text-[11px] text-gray-400 italic">Nenhuma atribuição detectada...</span>`;
        return;
    }
    el.innerHTML = systems.map(sys => `
        <div class="mb-3">
            <div class="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-gray-500 border-b border-gray-50 pb-0.5 uppercase">
                <i class="fa-solid fa-folder-tree text-indigo-400"></i> ${sys}
            </div>
            <div class="flex flex-col gap-1.5 pl-2">
                ${Object.keys(teamWorkload[sys]).sort().map(name => {
                    const dev    = teamWorkload[sys][name];
                    const isOver = dev.totalCount >= 5;
                    return `
                        <div class="flex flex-col gap-1">
                            <div class="flex justify-between items-center text-[11px] ${isOver ? 'text-red-600 font-bold' : 'text-gray-700'}">
                                <span class="truncate">${isOver ? '⚠️ ' : ''}${name}</span>
                                <span class="${isOver ? 'bg-red-600 text-white' : 'bg-indigo-100 text-indigo-700'} px-1.5 py-0.5 rounded-full font-bold text-[9px]">${dev.totalCount}</span>
                            </div>
                            <ul class="space-y-1">
                                ${dev.activeCards.map(c => `
                                    <li class="bg-gray-50 border border-gray-200 rounded p-1 text-[10px] flex justify-between items-center">
                                        <span class="truncate font-mono">${c.title}</span>
                                        <button onclick="toggleComplete('${c.id}', true)" class="text-gray-400 hover:text-emerald-600"><i class="fa-solid fa-check"></i></button>
                                    </li>`).join('')}
                            </ul>
                        </div>`;
                }).join('')}
            </div>
        </div>`).join('');
}

function renderQuadrants(quadrants) {
    Object.keys(quadrants).forEach(q => {
        const listEl = document.getElementById(`list-${q}`);
        document.getElementById(`count-${q}`).innerText = quadrants[q].length;

        quadrants[q].sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            if (a.deadline && b.deadline)    return new Date(a.deadline) - new Date(b.deadline);
            if (a.deadline) return -1;
            if (b.deadline) return  1;
            return 0;
        });

        if (quadrants[q].length === 0) {
            const msgs = { all: 'Sem demandas.', pending: 'Nada pendente.', completed: 'Nada concluído.' };
            const msg  = selectedSystemFilter ? `Nenhum para [${selectedSystemFilter}].` : (msgs[currentStatusFilter] || 'Sem demandas.');
            listEl.innerHTML = `<li class="text-xs text-gray-400 italic text-center py-4 empty-placeholder">${msg}</li>`;
            return;
        }

        quadrants[q].forEach(item => {
            const li = document.createElement('li');
            const isExpanded = expandedTaskId === item.id;
            li.className = `flex flex-col p-2.5 bg-gray-50 border border-gray-200 rounded-lg transition cursor-grab active:cursor-grabbing select-none ${
                item.completed ? 'opacity-50 bg-gray-100' : 'hover:bg-gray-100 shadow-2xs'}`;
            li.setAttribute('data-id', item.id);
            li.setAttribute('onclick', `toggleExpand('${item.id}', event)`);

            const fireBadge  = (item.quadrant === 'q1' && !item.completed) ? '<span class="animate-fire ml-1">🔥</span>' : '';
            const hasDesc    = item.description && item.description.trim() !== '';
            const deadlineBadge = getDeadlineBadge(item.deadline, item.completed);
            const icon       = getJiraIcon(item.title);

            let displayDev = (item.developer || '').trim();
            if (!displayDev) {
                const m = item.title.match(/\[(.*?)\]/);
                if (m) {
                    const after = item.title.split(']')[1]?.trim() || '';
                    displayDev = after.split(/[:\-]/)[0].trim();
                }
            }
            const devBadge = displayDev
                ? `<span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 mt-1"><i class="fa-solid fa-user text-[9px] mr-1"></i>${displayDev}</span>`
                : '';

            li.innerHTML = `
                <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-2 min-w-0">
                        <input type="checkbox" ${item.completed ? 'checked' : ''} onclick="toggleComplete('${item.id}')"
                               class="mt-0.5 shrink-0 cursor-pointer accent-indigo-600">
                        <span class="text-xs font-medium leading-snug break-all ${item.completed ? 'line-through text-gray-400' : 'text-gray-800'}">
                            ${icon}${item.title}${fireBadge}
                        </span>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <button onclick="copyTaskToClipboard('${item.id}')" class="text-gray-300 hover:text-indigo-500 p-1 rounded" title="Copiar"><i class="fa-solid fa-share-nodes text-xs"></i></button>
                        <button onclick="openEditModal('${item.id}')"      class="text-gray-300 hover:text-indigo-500 p-1 rounded" title="Editar"><i class="fa-solid fa-pen text-xs"></i></button>
                        <button onclick="deleteDemand('${item.id}')"       class="text-gray-300 hover:text-red-500   p-1 rounded" title="Excluir"><i class="fa-solid fa-trash text-xs"></i></button>
                    </div>
                </div>
                ${isExpanded ? `
                <div class="mt-2 pt-2 border-t border-gray-200 flex flex-wrap items-center gap-1.5">
                    ${deadlineBadge}
                    ${devBadge}
                    ${hasDesc ? `<p class="w-full text-[11px] text-gray-500 mt-1 leading-relaxed">${item.description}</p>` : ''}
                    ${item.completedAt ? `<span class="text-[10px] text-gray-400"><i class="fa-solid fa-flag-checkered mr-1"></i>Concluída ${item.completedAt}</span>` : ''}
                </div>` : ''}`;
            listEl.appendChild(li);
        });
    });
}

function renderArchiveList(archivedList) {
    const el = document.getElementById('archive-list');
    if (!el) return;
    el.innerHTML = '';
    if (archivedList.length === 0) {
        el.innerHTML = `<li class="text-xs text-gray-400 italic text-center py-4">Histórico limpo.</li>`;
        return;
    }
    archivedList.forEach(item => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs';
        li.innerHTML = `
            <span class="text-gray-500 line-through truncate font-medium">${item.title}</span>
            <button onclick="unarchiveDemand('${item.id}')" class="text-indigo-600 p-1 hover:bg-indigo-50 rounded" title="Desarquivar">
                <i class="fa-solid fa-arrow-rotate-left"></i>
            </button>`;
        el.appendChild(li);
    });
}

// ── Inicialização ────────────────────────────────────────────

async function initApp() {
    if (SHEET_API_URL && !SHEET_API_URL.includes('SUA_API_ID')) {
        try {
            const res  = await fetch(SHEET_API_URL);
            if (res.ok) {
                const data        = await res.json();
                const cloudDemands = Array.isArray(data) ? data : (data.data || []);
                if (cloudDemands.length > 0) demands = cloudDemands;
            }
        } catch (err) {
            console.error('Erro ao carregar dados da nuvem:', err);
        }
    }

    const savedHandle = await getStoredHandle();
    if (savedHandle && window.showOpenFilePicker) {
        try {
            persistentFileHandle = savedHandle;
            const perm = await persistentFileHandle.queryPermission({ mode: 'readwrite' });
            updateBackupStatus(perm === 'granted');
        } catch (e) {
            console.log('Aguardando interação para reconectar arquivo...');
        }
    }

    if (demands.length === 0) {
        const stored = localStorage.getItem('my_demands');
        demands = stored ? JSON.parse(stored).map(d => ({
            archived: false, description: '', completedAt: null, ...d,
        })) : [];
    } else {
        demands = demands.map(d => ({ archived: false, description: '', completedAt: null, ...d }));
    }

    if (scratchpad) scratchpad.value = localStorage.getItem('my_scratchpad') || '';
    renderDemands();
}

initApp();
