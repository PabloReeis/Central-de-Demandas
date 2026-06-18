// ============================================================
// ui.js — Interações de interface: modais, filtros, tema, etc.
// ============================================================

// --- Referências a elementos do DOM ---
const form              = document.getElementById('demand-form');
const taskTitleInput    = document.getElementById('task-title');
const taskDeveloperInput = document.getElementById('task-developer');
const taskDeadlineInput = document.getElementById('task-deadline');
const taskQuadrantSelect = document.getElementById('task-quadrant');
const taskDescInput     = document.getElementById('task-desc');
const searchInput       = document.getElementById('search-input');
const scratchpad        = document.getElementById('scratchpad');

const editModal         = document.getElementById('edit-modal');
const editForm          = document.getElementById('edit-form');
const editTaskId        = document.getElementById('edit-task-id');
const editTaskTitle     = document.getElementById('edit-task-title');
const editTaskDeveloper = document.getElementById('edit-task-developer');
const editTaskDeadline  = document.getElementById('edit-task-deadline');
const editTaskQuadrant  = document.getElementById('edit-task-quadrant');
const editTaskDesc      = document.getElementById('edit-task-desc');

// --- Tema claro / escuro ---
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

// --- Sidebar de arquivadas ---
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

// --- Filtros de status ---
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

// --- Expansão de cards ---
let expandedTaskId = null;

function toggleExpand(id, event) {
    if (event.target.closest('input[type="checkbox"]') || event.target.closest('button')) return;
    expandedTaskId = (expandedTaskId === id) ? null : id;
    renderDemands();
}

// --- Modal de edição ---
function openEditModal(id) {
    const task = demands.find(t => t.id === id);
    if (!task) return;
    editTaskId.value        = task.id;
    editTaskTitle.value     = task.title;
    editTaskDeveloper.value = task.developer || '';
    editTaskDeadline.value  = task.deadline  || '';
    editTaskQuadrant.value  = task.quadrant;
    editTaskDesc.value      = task.description || '';
    editModal.classList.remove('hidden');
}

function closeEditModal() {
    editModal.classList.add('hidden');
    editForm.reset();
}

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editTaskId.value;
    demands = demands.map(item => {
        if (item.id === id) {
            item.title       = editTaskTitle.value.trim();
            item.developer   = editTaskDeveloper.value.trim();
            item.deadline    = editTaskDeadline.value || null;
            item.quadrant    = editTaskQuadrant.value;
            item.description = editTaskDesc.value.trim();
        }
        return item;
    });
    closeEditModal();
    updateApp();
});

// --- Inserção rápida de prefixos ---
function injectPrefix(prefix) {
    taskTitleInput.value = prefix;
    taskTitleInput.focus();
}

// --- Scratchpad ---
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

    taskTitleInput.value   = cleanedText;
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

// --- Clipboard ---
function copyToClipboardDaily() {
    const done = demands.filter(d => d.completed && !d.archived);
    if (done.length === 0) { alert('Nenhuma tarefa concluída para copiar!'); return; }
    let text = '📋 *Tarefas Concluídas para a Daily:*\n';
    done.forEach(d => {
        text += `* ✅ ${d.title}${d.description ? ' - ' + d.description.trim() : ''}\n`;
    });
    navigator.clipboard.writeText(text).then(() => alert('Copiado com sucesso!'));
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
        .then(() => alert('Copiado com sucesso!'));
}

// --- Guardar dados no localStorage ao fechar ---
window.addEventListener('beforeunload', () => {
    localStorage.setItem('my_demands', JSON.stringify(demands));
});
