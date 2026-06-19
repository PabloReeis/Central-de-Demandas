// ============================================================
// ui.js — Interações de interface: modais, filtros, tema, etc.
// ============================================================

// --- Referências a elementos do DOM ---
const form               = document.getElementById('demand-form');
const taskTitleInput     = document.getElementById('task-title');
const taskDeveloperInput = document.getElementById('task-developer');
const taskDeadlineInput  = document.getElementById('task-deadline');
const taskQuadrantSelect = document.getElementById('task-quadrant');
const taskDescInput      = document.getElementById('task-desc');
const searchInput        = document.getElementById('search-input');
const scratchpad         = document.getElementById('scratchpad');

const editModal          = document.getElementById('edit-modal');
const editForm           = document.getElementById('edit-form');
const editTaskId         = document.getElementById('edit-task-id');
const editTaskTitle      = document.getElementById('edit-task-title');
const editTaskDeveloper  = document.getElementById('edit-task-developer');
const editTaskDeadline   = document.getElementById('edit-task-deadline');
const editTaskQuadrant   = document.getElementById('edit-task-quadrant');
const editTaskDesc       = document.getElementById('edit-task-desc');

// ── Toast (substitui alert/confirm nativos) ─────────────────

function showToast(message, type = 'success', duration = 3000) {
    const existing = document.getElementById('app-toast');
    if (existing) existing.remove();

    const colors = {
        success: 'bg-emerald-600',
        error:   'bg-red-600',
        warning: 'bg-amber-500',
        info:    'bg-indigo-600',
    };
    const icons = {
        success: 'fa-circle-check',
        error:   'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info:    'fa-circle-info',
    };

    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = `fixed bottom-5 right-5 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-white text-sm font-medium ${colors[type]} transition-all duration-300 translate-y-4 opacity-0`;
    toast.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${message}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-y-4', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Substitui confirm() nativo por modal customizado
function showConfirm(message, onConfirm) {
    const existing = document.getElementById('app-confirm');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'app-confirm';
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-xs z-[9998] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl border border-gray-100 w-full max-w-sm p-5 flex flex-col gap-4">
            <p class="text-sm text-gray-700 font-medium leading-relaxed">${message}</p>
            <div class="flex justify-end gap-2">
                <button id="confirm-cancel" class="px-4 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 cursor-pointer">Cancelar</button>
                <button id="confirm-ok"     class="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg cursor-pointer">Confirmar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    document.getElementById('confirm-cancel').onclick = () => modal.remove();
    document.getElementById('confirm-ok').onclick = () => { modal.remove(); onConfirm(); };
}

// ── Tema claro / escuro ─────────────────────────────────────

function setTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('btn-theme-dark').classList.add('active');
        document.getElementById('btn-theme-light').classList.remove('active');
    } else {
        document.body.classList.remove('dark-mode');
        document.getElementById('btn-theme-light').classList.add('active');
        document.getElementById('btn-theme-dark').classList.remove('active');
    }
    localStorage.setItem('app_theme', theme);
}
(function () {
    const saved = localStorage.getItem('app_theme') || 'light';
    if (saved === 'dark') setTheme('dark');
})();

// ── Sidebar de arquivadas ───────────────────────────────────

function toggleSidebar(open) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (open) {
        overlay.classList.remove('hidden');
        setTimeout(() => {
            overlay.classList.add('opacity-100');
            sidebar.classList.remove('translate-x-full');
        }, 10);
    } else {
        sidebar.classList.add('translate-x-full');
        overlay.classList.remove('opacity-100');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

// ── Filtros de status ───────────────────────────────────────

let currentStatusFilter  = 'all';
let selectedSystemFilter = null;

function setStatusFilter(filter) {
    currentStatusFilter = filter;
    ['all', 'pending', 'completed'].forEach(f => {
        const btn = document.getElementById(`btn-filter-${f}`);
        btn.classList.replace(f === filter ? 'filter-inactive' : 'filter-active',
                              f === filter ? 'filter-active'   : 'filter-inactive');
    });
    renderDemands();
}

function filterBySystem(systemName) {
    selectedSystemFilter = systemName;
    renderDemands();
}

// ── Expansão de cards ───────────────────────────────────────

let expandedTaskId = null;

function toggleExpand(id, event) {
    if (event.target.closest('input[type="checkbox"]') || event.target.closest('button')) return;
    expandedTaskId = (expandedTaskId === id) ? null : id;
    renderDemands();
}

// ── Modal de edição ─────────────────────────────────────────

function openEditModal(id) {
    const task = demands.find(t => t.id === id);
    if (!task) return;
    editTaskId.value        = task.id;
    editTaskTitle.value     = task.title;
    editTaskDeveloper.value = task.developer  || '';
    editTaskDeadline.value  = task.deadline   || '';
    editTaskQuadrant.value  = task.quadrant;
    editTaskDesc.value      = task.description || '';
    // Load tags into checkboxes
    document.querySelectorAll('.tag-checkbox').forEach(cb => {
        cb.checked = (task.tags || []).includes(cb.value);
    });
    editModal.classList.remove('hidden');
    setTimeout(() => editTaskTitle.focus(), 50);
}

function closeEditModal() {
    editModal.classList.add('hidden');
    editForm.reset();
}

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id       = editTaskId.value;
    const newTags  = Array.from(document.querySelectorAll('.tag-checkbox:checked')).map(cb => cb.value);
    const newQuadrant = editTaskQuadrant.value;
    demands = demands.map(item => {
        if (item.id === id) {
            const oldQ = item.quadrant;
            item.title       = editTaskTitle.value.trim();
            item.developer   = editTaskDeveloper.value.trim();
            item.deadline    = editTaskDeadline.value || null;
            item.quadrant    = newQuadrant;
            item.description = editTaskDesc.value.trim();
            item.tags        = newTags;
            if (!item.history) item.history = [];
            if (oldQ !== newQuadrant) {
                item.history.push({
                    date: new Date().toLocaleDateString('pt-BR').substring(0, 5),
                    from: oldQ,
                    to:   newQuadrant,
                    note: 'Movida via edição',
                });
            }
        }
        return item;
    });
    closeEditModal();
    await updateApp();
    showToast('Demanda atualizada!');
});

// ── Atalhos de teclado ──────────────────────────────────────

document.addEventListener('keydown', (e) => {
    // Ctrl+Enter no formulário principal: submete
    if (e.ctrlKey && e.key === 'Enter') {
        const active = document.activeElement;
        if (form.contains(active)) {
            e.preventDefault();
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        if (editModal.contains(active) && !editModal.classList.contains('hidden')) {
            e.preventDefault();
            editForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
    }
    // Escape: fecha modais
    if (e.key === 'Escape') {
        if (!editModal.classList.contains('hidden')) closeEditModal();
        const reportModal = document.getElementById('report-modal');
        if (reportModal && !reportModal.classList.contains('hidden')) closeReportModal();
        const confirm = document.getElementById('app-confirm');
        if (confirm) confirm.remove();
    }
    // Ctrl+N: foca no campo de nova demanda
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        taskTitleInput.focus();
        taskTitleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

// ── Inserção rápida de prefixos ─────────────────────────────

function injectPrefix(prefix) {
    taskTitleInput.value = prefix;
    taskTitleInput.focus();
}

// ── Scratchpad ──────────────────────────────────────────────

function saveScratchpad() {
    localStorage.setItem('my_scratchpad', scratchpad.value);
    renderScratchpadIdeas();
}

function pushIdeaToForm(text) {
    const match = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    let finalDate = '', cleanedText = text;

    if (match) {
        let day   = match[1].padStart(2, '0');
        let month = match[2].padStart(2, '0');
        let year  = match[3] || new Date().getFullYear();
        if (year.toString().length === 2) year = '20' + year;
        finalDate   = `${year}-${month}-${day}`;
        cleanedText = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim()
                          .replace(/\s*(ate|até|para|pra|dia|ate o dia)\s*$/i, '').trim();
    }

    taskTitleInput.value    = cleanedText;
    taskDeadlineInput.value = finalDate;
    taskTitleInput.focus();
    taskTitleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderScratchpadIdeas() {
    const ideasList = document.getElementById('scratch-ideas-list');
    if (!ideasList) return;
    ideasList.innerHTML = '';

    const lines = scratchpad.value.split('\n')
        .map(l => l.replace(/^[•\-\*\s\d\.\)]+/, '').trim())
        .filter(l => l.length > 2);

    if (lines.length === 0) {
        ideasList.innerHTML = `<li class="text-[11px] text-gray-400 italic">Sem linhas válidas para envio.</li>`;
        return;
    }

    lines.forEach(line => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center bg-gray-50 hover:bg-indigo-50 border border-gray-200 rounded-md p-1.5 text-[11px] transition';
        li.innerHTML = `
            <span class="truncate text-gray-700 font-medium max-w-[180px]">${line}</span>
            <button onclick="pushIdeaToForm('${line.replace(/'/g, "\\'")}')"
                    class="text-indigo-600 hover:text-indigo-800 p-0.5 cursor-pointer" title="Transformar em Demanda">
                <i class="fa-regular fa-lightbulb"></i>
            </button>`;
        ideasList.appendChild(li);
    });
}

// ── Clipboard ───────────────────────────────────────────────

function copyToClipboardDaily() {
    const done = demands.filter(d => d.completed && !d.archived);
    if (done.length === 0) { showToast('Nenhuma tarefa concluída para copiar!', 'warning'); return; }
    let text = '📋 *Tarefas Concluídas para a Daily:*\n';
    done.forEach(d => {
        text += `* ✅ ${d.title}${d.description ? ' - ' + d.description.trim() : ''}\n`;
    });
    navigator.clipboard.writeText(text).then(() => showToast('Daily copiada para a área de transferência!'));
}

function copyTaskToClipboard(id) {
    const task = demands.find(t => t.id === id);
    if (!task) return;
    const systemMatch = task.title.match(/\[(.*?)\]/);
    const systemName  = systemMatch ? systemMatch[1].trim() : 'Geral';
    let devName = (task.developer || '').trim();
    if (!devName && systemMatch) {
        const after = task.title.split(']')[1]?.trim() || '';
        devName = after.split(/[:\-]/)[0].trim();
    }
    const cardName = systemMatch ? task.title.split('[')[0].trim() : task.title;
    navigator.clipboard.writeText(`${systemName}\n${devName || 'Não atribuído'}\n${cardName}`)
        .then(() => showToast('Copiado!'));
}

// ── Auto-foco ao carregar ───────────────────────────────────

window.addEventListener('load', () => {
    taskTitleInput.focus();
});

// ── Guardar no localStorage ao fechar ──────────────────────

window.addEventListener('beforeunload', () => {
    localStorage.setItem('my_demands', JSON.stringify(demands));
});
