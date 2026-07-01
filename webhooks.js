// ============================================================
// webhooks.js — Integração via Supabase Realtime
//   Webhook 1: Alertas gerais de sistema (banner fixo no topo)
//   Webhook 2: Novos Jiras via n8n (entrada na fila destacada)
// ============================================================

// ── Configuração ─────────────────────────────────────────────

const WEBHOOK_SYSTEMS = ['JPe', 'SIAP', 'Themis'];

const SEVERITY_CONFIG = {
    alta:  { gradient: 'from-red-600 to-rose-700',    icon: 'fa-triangle-exclamation', badge: 'bg-red-500',    label: 'CRÍTICO',  ring: '#ef4444' },
    media: { gradient: 'from-amber-500 to-orange-600', icon: 'fa-circle-exclamation',  badge: 'bg-amber-500',  label: 'ATENÇÃO',  ring: '#f59e0b' },
    baixa: { gradient: 'from-blue-600 to-indigo-700',  icon: 'fa-circle-info',          badge: 'bg-blue-500',   label: 'INFO',     ring: '#3b82f6' },
};

const SYSTEM_ICON = {
    JPe:    '⚖️',
    SIAP:   '🏛️',
    Themis: '🔱',
};

// IDs de alertas já exibidos nesta sessão
const _shownAlerts = new Set();
const _shownJiras  = new Set();

// ── Inicialização ─────────────────────────────────────────────

async function initWebhooks() {
    if (!isSupabaseConfigured()) return;

    // 1. Busca alertas ativos não descartados
    await fetchPendingAlerts();

    // 2. Busca Jiras não consumidos
    await fetchPendingJiras();

    // 3. Inicia Realtime para as duas tabelas
    initWebhookRealtime();
}

// ── Realtime WebSocket ────────────────────────────────────────

function initWebhookRealtime() {
    const wsUrl = SUPABASE_URL.replace('https://', 'wss://')
        + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';

    const socket = new WebSocket(wsUrl);
    let heartbeat;

    socket.onopen = () => {
        // Subscribe em webhook_alerts
        socket.send(JSON.stringify({
            topic: 'realtime:public:webhook_alerts',
            event: 'phx_join',
            payload: { user_token: SUPABASE_ANON_KEY },
            ref: 'wh_alerts',
        }));
        // Subscribe em webhook_jiras
        socket.send(JSON.stringify({
            topic: 'realtime:public:webhook_jiras',
            event: 'phx_join',
            payload: { user_token: SUPABASE_ANON_KEY },
            ref: 'wh_jiras',
        }));
        heartbeat = setInterval(() => {
            socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'wh_hb' }));
        }, 20000);
        console.log('🔔 Webhook Realtime conectado');
    };

    socket.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.event !== 'INSERT') return;

        const record = msg.payload?.record;
        if (!record) return;

        if (msg.topic === 'realtime:public:webhook_alerts') {
            if (!_shownAlerts.has(record.id)) showAlertBanner(record);
        }
        if (msg.topic === 'realtime:public:webhook_jiras') {
            if (!_shownJiras.has(record.id)) handleIncomingJira(record);
        }
    };

    socket.onerror = () => console.warn('Webhook Realtime: erro de conexão');
    socket.onclose = () => {
        clearInterval(heartbeat);
        setTimeout(initWebhookRealtime, 5000);
    };
}

// ── Fetch inicial ─────────────────────────────────────────────

async function fetchPendingAlerts() {
    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/webhook_alerts?dismissed=eq.false&order=created_at.desc&limit=5`,
            { headers: supabaseHeaders() }
        );
        if (!res.ok) return;
        const rows = await res.json();
        rows.reverse().forEach(row => {
            if (!_shownAlerts.has(row.id)) showAlertBanner(row);
        });
    } catch (err) {
        console.warn('fetchPendingAlerts:', err);
    }
}

async function fetchPendingJiras() {
    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/webhook_jiras?consumed=eq.false&order=created_at.asc`,
            { headers: supabaseHeaders() }
        );
        if (!res.ok) return;
        const rows = await res.json();
        for (const row of rows) {
            if (!_shownJiras.has(row.id)) await handleIncomingJira(row, false);
        }
    } catch (err) {
        console.warn('fetchPendingJiras:', err);
    }
}

// ── Webhook 1 — Banners de Alerta ─────────────────────────────

function showAlertBanner(alert) {
    _shownAlerts.add(alert.id);

    const container = document.getElementById('alert-banners');
    if (!container) return;

    const cfg      = SEVERITY_CONFIG[alert.severidade] || SEVERITY_CONFIG.alta;
    const sysIcon  = SYSTEM_ICON[alert.sistema] || '⚠️';
    const timeStr  = new Date(alert.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const banner = document.createElement('div');
    banner.id = `alert-banner-${alert.id}`;
    banner.className = `alert-banner bg-gradient-to-r ${cfg.gradient} text-white shadow-2xl`;
    banner.innerHTML = `
        <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="alert-pulse-ring" style="--ring-color: ${cfg.ring}">
                <i class="fa-solid ${cfg.icon} text-white text-base"></i>
            </div>
            <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full tracking-widest uppercase">${cfg.label}</span>
                    <span class="text-sm font-bold">${sysIcon} ${alert.sistema}</span>
                    <span class="text-[10px] text-white/60">${timeStr}</span>
                </div>
                <p class="text-xs text-white/90 mt-0.5 leading-snug truncate">${alert.mensagem}</p>
            </div>
        </div>
        <button
            onclick="dismissAlertBanner('${alert.id}')"
            class="shrink-0 text-white/60 hover:text-white hover:bg-white/10 w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ml-2"
            title="Dispensar">
            <i class="fa-solid fa-xmark text-sm"></i>
        </button>`;

    container.appendChild(banner);

    // Anima entrada
    requestAnimationFrame(() => banner.classList.add('alert-banner--visible'));

    // Auto-dismiss após 5 minutos
    setTimeout(() => dismissAlertBanner(alert.id), 5 * 60 * 1000);
}

async function dismissAlertBanner(alertId) {
    const banner = document.getElementById(`alert-banner-${alertId}`);
    if (banner) {
        banner.classList.remove('alert-banner--visible');
        banner.classList.add('alert-banner--hiding');
        setTimeout(() => banner.remove(), 350);
    }
    // Marca como dismissed no Supabase
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/webhook_alerts?id=eq.${alertId}`, {
            method:  'PATCH',
            headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
            body:    JSON.stringify({ dismissed: true }),
        });
    } catch (err) {
        console.warn('Erro ao marcar alerta como dismissed:', err);
    }
}

// ── Webhook 2 — Jira entra na Fila ────────────────────────────

async function handleIncomingJira(jira, showNotification = true) {
    _shownJiras.add(jira.id);

    // Formata o título no padrão da fila: "CÓDIGO [SISTEMA]"
    const title = `${jira.jira} [${jira.sistema}]`;

    // Evita duplicata na fila local
    if (entryQueue.some(q => q.title.toLowerCase() === title.toLowerCase())) {
        await markJiraConsumed(jira.id);
        return;
    }

    // Garante que o sistema existe na lista
    if (!queueSystems.includes(jira.sistema)) {
        try {
            if (isSupabaseConfigured()) {
                await sbPost('queue_systems', {
                    id:       `sys_${Date.now()}`,
                    name:     jira.sistema,
                    position: queueSystems.length,
                });
            }
            queueSystems.push(jira.sistema);
            renderSystemList();
            renderQueueSystemSelect();
        } catch (err) {
            console.warn('Erro ao criar sistema:', err);
        }
    }

    const id        = `wh_${jira.id}`;
    const createdAt = new Date().toLocaleDateString('pt-BR').substring(0, 5);

    const queueItem = {
        id,
        title,
        system:      jira.sistema,
        developer:   null,
        description: jira.resumo || null,
        deadline:    null,
        createdAt,
        source:      'webhook',   // flag para estilização especial
        webhookId:   jira.id,
    };

    try {
        if (isSupabaseConfigured()) {
            await sbPost('entry_queue', {
                id,
                title,
                system:      jira.sistema,
                description: jira.resumo || null,
                created_day: createdAt,
                source:      'webhook',
            });
        }
        entryQueue.push(queueItem);
        saveQueueLocal();
        renderQueueView();
        renderSidebarQueuePreview();
        renderSystemList();
        updateQueueBadge();

        if (showNotification) {
            showToast(`🔗 Novo Jira recebido: ${jira.jira} [${jira.sistema}]`, 'info', 5000);
            // Pisca o badge da aba Fila de Entrada
            pulseQueueTab();
        }

        await markJiraConsumed(jira.id);
    } catch (err) {
        console.error('Erro ao inserir Jira na fila:', err);
    }
}

async function markJiraConsumed(jiraId) {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/webhook_jiras?id=eq.${jiraId}`, {
            method:  'PATCH',
            headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
            body:    JSON.stringify({ consumed: true }),
        });
    } catch (err) {
        console.warn('Erro ao marcar Jira como consumido:', err);
    }
}

// ── Animação no badge da aba Fila ─────────────────────────────

function pulseQueueTab() {
    const badge = document.getElementById('queue-tab-count');
    if (!badge) return;
    badge.classList.add('animate-bounce');
    setTimeout(() => badge.classList.remove('animate-bounce'), 2000);
}

// ── Inicializar ao carregar ───────────────────────────────────

window.addEventListener('load', () => {
    // Pequeno delay para garantir que persistence.js e queue.js já iniciaram
    setTimeout(initWebhooks, 1500);
});
