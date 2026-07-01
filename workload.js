// ============================================================
// workload.js — Modal de Carga de Trabalho da Equipe
// ============================================================

// Nomes a excluir da carga de trabalho (case-insensitive)
const WORKLOAD_EXCLUDE = ['pablo'];

function isExcluded(name) {
    if (!name) return true;
    return WORKLOAD_EXCLUDE.some(ex => name.toLowerCase().includes(ex.toLowerCase()));
}

// ── Abrir / Fechar ───────────────────────────────────────────

function openWorkloadModal() {
    document.getElementById('workload-modal').classList.remove('hidden');
    renderWorkloadModal();
}

function closeWorkloadModal() {
    document.getElementById('workload-modal').classList.add('hidden');
}

// ── Calcular dados da equipe ─────────────────────────────────

function calcWorkload() {
    // devData[devName] = { active: [], completed: 0, total: 0 }
    const devData = {};

    demands.forEach(d => {
        const devName = extractDevName(d);
        if (!devName || devName.length < 2) return;
        if (isExcluded(devName)) return;

        if (!devData[devName]) {
            devData[devName] = { active: [], completed: 0, total: 0 };
        }

        devData[devName].total++;

        if (d.archived) return; // arquivadas não contam como ativas

        if (d.completed) {
            devData[devName].completed++;
        } else {
            const systemMatch = d.title.match(/\[(.*?)\]/);
            const sys = systemMatch ? systemMatch[1].trim() : 'Geral';
            const jiraMatch = d.title.match(/^([A-Z0-9\-]+)/);
            const code = jiraMatch ? jiraMatch[1] : d.title.substring(0, 18);
            devData[devName].active.push({
                id:       d.id,
                code,
                system:   sys,
                quadrant: d.quadrant,
                deadline: d.deadline,
                tags:     d.tags || [],
            });
        }
    });

    return devData;
}

// ── Renderização ─────────────────────────────────────────────

function renderWorkloadModal() {
    const devData = calcWorkload();
    const devNames = Object.keys(devData).sort();

    const kpiRow   = document.getElementById('workload-kpi-row');
    const devGrid  = document.getElementById('workload-dev-grid');
    const emptyEl  = document.getElementById('workload-empty');

    if (devNames.length === 0) {
        kpiRow.innerHTML  = '';
        devGrid.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }

    emptyEl.classList.add('hidden');

    // ── KPI summary ──────────────────────────────────────────
    const totalDevs      = devNames.length;
    const totalActive    = devNames.reduce((s, n) => s + devData[n].active.length, 0);
    const totalCompleted = devNames.reduce((s, n) => s + devData[n].completed, 0);
    const overloaded     = devNames.filter(n => devData[n].active.length >= 5).length;

    kpiRow.innerHTML = `
        <div class="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-xs">
            <p class="text-[10px] font-bold text-indigo-400 uppercase tracking-wide mb-1">Devs Ativos</p>
            <p class="text-2xl font-bold text-indigo-700">${totalDevs}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-xs">
            <p class="text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-1">Demandas Ativas</p>
            <p class="text-2xl font-bold text-amber-600">${totalActive}</p>
        </div>
        <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center shadow-xs">
            <p class="text-[10px] font-bold text-emerald-400 uppercase tracking-wide mb-1">Concluídas</p>
            <p class="text-2xl font-bold text-emerald-700">${totalCompleted}</p>
        </div>
        <div class="${overloaded > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-200'} border rounded-xl p-3 text-center shadow-xs">
            <p class="text-[10px] font-bold ${overloaded > 0 ? 'text-red-400' : 'text-gray-400'} uppercase tracking-wide mb-1">Sobrecarregados</p>
            <p class="text-2xl font-bold ${overloaded > 0 ? 'text-red-600' : 'text-gray-500'}">${overloaded}</p>
        </div>`;

    // ── Dev cards ────────────────────────────────────────────
    const QUADRANT_COLORS = {
        q1: { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    dot: 'bg-red-500'    },
        q2: { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
        q3: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
        q4: { bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
    };

    const QUADRANT_LABELS = { q1: 'Fazer Agora', q2: 'Agendar', q3: 'Delegar', q4: 'Eliminar' };

    devGrid.innerHTML = devNames.map(name => {
        const dev       = devData[name];
        const activeQty = dev.active.length;
        const isOver    = activeQty >= 5;
        const initials  = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

        // Avatar color based on name hash
        const colors = ['bg-indigo-600', 'bg-emerald-600', 'bg-violet-600', 'bg-sky-600', 'bg-rose-600', 'bg-amber-600'];
        const avatarColor = colors[name.charCodeAt(0) % colors.length];

        // Progress bar (max 10)
        const pct = Math.min(100, (activeQty / 10) * 100);
        const barColor = isOver ? 'bg-red-500' : activeQty >= 3 ? 'bg-amber-500' : 'bg-indigo-500';

        const demandItems = dev.active.map(item => {
            const qc = QUADRANT_COLORS[item.quadrant] || QUADRANT_COLORS.q4;
            const ql = QUADRANT_LABELS[item.quadrant] || item.quadrant;
            return `
                <li class="flex items-center gap-2 ${qc.bg} border ${qc.border} rounded-lg px-2.5 py-1.5">
                    <span class="w-1.5 h-1.5 rounded-full ${qc.dot} shrink-0"></span>
                    <span class="flex-1 font-mono text-[10px] font-semibold ${qc.text} truncate">${item.code}</span>
                    <span class="text-[9px] ${qc.text} opacity-70 shrink-0">${ql}</span>
                </li>`;
        }).join('');

        return `
            <div class="bg-white border ${isOver ? 'border-red-300' : 'border-gray-200'} rounded-xl p-4 shadow-xs flex flex-col gap-3">
                <!-- Dev header -->
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl ${avatarColor} flex items-center justify-center shrink-0">
                        <span class="text-[11px] font-bold text-white">${initials}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-bold text-gray-800 truncate">${name}</p>
                        <p class="text-[10px] text-gray-400">${dev.total} total · ${dev.completed} concluída${dev.completed !== 1 ? 's' : ''}</p>
                    </div>
                    <span class="text-sm font-bold px-2.5 py-1 rounded-lg ${isOver ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'}">
                        ${activeQty} ativa${activeQty !== 1 ? 's' : ''}
                    </span>
                </div>

                <!-- Progress bar -->
                <div>
                    <div class="flex justify-between text-[9px] text-gray-400 mb-1">
                        <span>${isOver ? '⚠️ Sobrecarregado' : 'Carga atual'}</span>
                        <span>${activeQty}/10</span>
                    </div>
                    <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div class="h-full rounded-full ${barColor} transition-all duration-500" style="width: ${pct}%"></div>
                    </div>
                </div>

                <!-- Demand list -->
                ${activeQty > 0 ? `
                <ul class="space-y-1 max-h-44 overflow-y-auto pr-0.5">
                    ${demandItems}
                </ul>` : `
                <p class="text-[11px] text-gray-400 italic text-center py-2">Sem demandas ativas</p>`}
            </div>`;
    }).join('');
}

// Escape para fechar é tratado globalmente em ui.js

