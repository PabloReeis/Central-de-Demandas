// ============================================================
// report.js — Painel de Relatório Semanal
// ============================================================

let reportCharts = {}; // guarda instâncias para destruir antes de recriar

function openReportModal() {
    document.getElementById('report-modal').classList.remove('hidden');
    renderReport();
}

function closeReportModal() {
    document.getElementById('report-modal').classList.add('hidden');
    // Destrói charts para liberar memória
    Object.values(reportCharts).forEach(c => c.destroy());
    reportCharts = {};
}

// ── Utilitários de data ──────────────────────────────────────

function getWeekBounds(weeksAgo = 0) {
    const now   = new Date();
    const day   = now.getDay(); // 0=Dom, 1=Seg...
    const diffToMon = (day === 0 ? -6 : 1 - day) - weeksAgo * 7;
    const mon   = new Date(now); mon.setHours(0,0,0,0); mon.setDate(now.getDate() + diffToMon);
    const sun   = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    return { start: mon, end: sun };
}

function parseBRDate(str) {
    // "DD/MM" → Date (ano corrente)
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length < 2) return null;
    const d = new Date();
    d.setDate(parseInt(parts[0]));
    d.setMonth(parseInt(parts[1]) - 1);
    d.setHours(12, 0, 0, 0);
    return d;
}

function fmtDate(date) {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ── Cálculo dos dados ────────────────────────────────────────

function calcReport(weeksAgo) {
    const { start, end } = getWeekBounds(weeksAgo);

    let created   = 0;
    let completed = 0;
    let q1Times   = []; // tempo em dias que ficou em Q1 antes de concluir
    let bySys     = {};
    let byDev     = {};
    let byQuadrant = { q1: 0, q2: 0, q3: 0, q4: 0, support_inbox: 0 };
    let tagCount  = {};
    let movedIn   = 0; // demandas que mudaram de quadrante na semana

    demands.forEach(d => {
        const history = d.history || [];

        // Criadas na semana
        const createEntry = history.find(h => h.note === 'Criada' || h.note === 'Criada via Fila Suporte');
        if (createEntry) {
            const createdDate = parseBRDate(createEntry.date);
            if (createdDate && createdDate >= start && createdDate <= end) {
                created++;
                // Conta por sistema
                const sysMatch = d.title.match(/\[(.*?)\]/);
                const sys = sysMatch ? sysMatch[1].trim() : 'Geral';
                bySys[sys] = (bySys[sys] || 0) + 1;
            }
        }

        // Concluídas na semana
        if (d.completedAt) {
            const completedDate = parseBRDate(d.completedAt);
            if (completedDate && completedDate >= start && completedDate <= end) {
                completed++;
                // Por responsável
                const dev = (d.developer || '').trim() || 'Não atribuído';
                byDev[dev] = (byDev[dev] || 0) + 1;
            }
        }

        // Movimentações na semana
        history.forEach(h => {
            if (h.from && h.to) {
                const moveDate = parseBRDate(h.date);
                if (moveDate && moveDate >= start && moveDate <= end) movedIn++;
            }
        });

        // Tempo em Q1 (demandas concluídas com histórico)
        if (d.completed && history.length > 1) {
            const enterQ1 = history.find(h => h.to === 'q1');
            const leave   = history.find(h => h.from === 'q1');
            if (enterQ1 && leave) {
                const t1 = parseBRDate(enterQ1.date);
                const t2 = parseBRDate(leave.date);
                if (t1 && t2) {
                    const days = Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
                    if (days >= 0) q1Times.push(days);
                }
            }
        }

        // Distribuição por quadrante (snapshot atual)
        if (!d.archived) byQuadrant[d.quadrant] = (byQuadrant[d.quadrant] || 0) + 1;

        // Etiquetas
        (d.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
    });

    const avgQ1Days = q1Times.length > 0
        ? (q1Times.reduce((a, b) => a + b, 0) / q1Times.length).toFixed(1)
        : null;

    return { created, completed, movedIn, avgQ1Days, bySys, byDev, byQuadrant, tagCount,
             period: `${fmtDate(start)} – ${fmtDate(end)}` };
}

// ── Renderização ─────────────────────────────────────────────

let reportWeeksAgo = 0;

function renderReport() {
    const data = calcReport(reportWeeksAgo);

    // Período
    document.getElementById('report-period').textContent = data.period;
    document.getElementById('report-nav-label').textContent =
        reportWeeksAgo === 0 ? 'Semana atual' : `${reportWeeksAgo} semana(s) atrás`;

    // KPIs
    document.getElementById('kpi-created').textContent   = data.created;
    document.getElementById('kpi-completed').textContent = data.completed;
    document.getElementById('kpi-moved').textContent     = data.movedIn;
    document.getElementById('kpi-q1time').textContent    = data.avgQ1Days !== null ? `${data.avgQ1Days}d` : '—';

    const balance = data.completed - data.created;
    const balEl = document.getElementById('kpi-balance');
    balEl.textContent = (balance >= 0 ? '+' : '') + balance;
    balEl.className = `text-2xl font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`;

    // Chart: distribuição atual por quadrante
    renderDonut('chart-quadrant', {
        labels: ['Q1 Fazer Agora', 'Q2 Agendar', 'Q3 Delegar', 'Q4 Eliminar', 'Suporte'],
        data:   [data.byQuadrant.q1, data.byQuadrant.q2, data.byQuadrant.q3, data.byQuadrant.q4, data.byQuadrant.support_inbox],
        colors: ['#ef4444','#3b82f6','#f59e0b','#6b7280','#8b5cf6'],
    });

    // Chart: demandas criadas por sistema
    const sysKeys = Object.keys(data.bySys).sort((a,b) => data.bySys[b] - data.bySys[a]).slice(0,6);
    renderBar('chart-systems', {
        labels: sysKeys.length ? sysKeys : ['—'],
        data:   sysKeys.length ? sysKeys.map(k => data.bySys[k]) : [0],
        color:  '#6366f1',
        label:  'Demandas criadas',
    });

    // Chart: concluídas por responsável
    const devKeys = Object.keys(data.byDev).sort((a,b) => data.byDev[b] - data.byDev[a]).slice(0,6);
    renderBar('chart-devs', {
        labels: devKeys.length ? devKeys : ['—'],
        data:   devKeys.length ? devKeys.map(k => data.byDev[k]) : [0],
        color:  '#10b981',
        label:  'Concluídas',
    });

    // Etiquetas ativas
    const tagEl = document.getElementById('report-tags');
    const tagEntries = Object.entries(data.tagCount).sort((a,b) => b[1]-a[1]);
    if (tagEntries.length === 0) {
        tagEl.innerHTML = '<span class="text-[11px] text-gray-400 italic">Nenhuma etiqueta ativa.</span>';
    } else {
        const TAGS_MAP = {
            blocked: { label: 'Bloqueada',  color: 'bg-red-100 text-red-700 border-red-200' },
            review:  { label: 'Em Revisão', color: 'bg-blue-100 text-blue-700 border-blue-200' },
            waiting: { label: 'Ag. Cliente',color: 'bg-amber-100 text-amber-700 border-amber-200' },
            testing: { label: 'Em Testes',  color: 'bg-purple-100 text-purple-700 border-purple-200' },
            deploy:  { label: 'Ag. Deploy', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
        };
        tagEl.innerHTML = tagEntries.map(([key, count]) => {
            const cfg = TAGS_MAP[key] || { label: key, color: 'bg-gray-100 text-gray-600 border-gray-200' };
            return `<span class="text-[11px] px-2 py-1 rounded-full border font-semibold flex items-center gap-1 ${cfg.color}">
                ${cfg.label} <span class="font-bold">${count}</span>
            </span>`;
        }).join('');
    }
}

function renderDonut(canvasId, { labels, data, colors }) {
    if (reportCharts[canvasId]) { reportCharts[canvasId].destroy(); delete reportCharts[canvasId]; }
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    reportCharts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } },
            cutout: '60%',
        },
    });
}

function renderBar(canvasId, { labels, data, color, label }) {
    if (reportCharts[canvasId]) { reportCharts[canvasId].destroy(); delete reportCharts[canvasId]; }
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    reportCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label,
                data,
                backgroundColor: color + 'cc',
                borderColor: color,
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { font: { size: 10 } }, grid: { color: '#f1f5f9' } },
                y: { ticks: { font: { size: 10 } }, grid: { display: false } },
            },
        },
    });
}

function reportPrev() { reportWeeksAgo++; renderReport(); }
function reportNext() { if (reportWeeksAgo > 0) { reportWeeksAgo--; renderReport(); } }
