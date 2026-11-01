/**
 * my_kaneki — App Layout & Interaction Controller
 * Renders the layout dynamically using window.KANEKI_DATA
 * Manages reactive interactions, tab switching, and theme state.
 */

(function () {
  const data = window.KANEKI_DATA;
  if (!data) {
    console.error("KANEKI_DATA not found. Please load data.js first.");
    return;
  }

  // State
  const state = {
    currentTab: "agent",
    collapsed: false,
    theme: localStorage.getItem("kaneki_theme") || data.initialTheme || "system",
    todos: [...data.todos],
    chatMessages: [...data.chat.messages],
    activeSessionId: data.chat.sessions[0]?.id || "s-1",
    modalOpen: false,
  };

  // DOM Elements
  const appContainer = document.getElementById("app-container");
  const modalBackdrop = document.getElementById("quota-modal");

  // Initialize
  function init() {
    applyTheme(state.theme);
    renderApp();
    setupGlobalEvents();
  }

  // Apply Theme
  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem("kaneki_theme", theme);
    const root = document.documentElement;

    if (theme === "light") {
      root.dataset.theme = "light";
    } else if (theme === "dark") {
      root.dataset.theme = "dark";
    } else {
      root.dataset.theme = "system";
    }

    // Update active state in UI
    document.querySelectorAll(".theme-seg-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === theme);
    });

    const collapsedBtn = document.querySelector(".theme-collapsed-btn");
    if (collapsedBtn) {
      collapsedBtn.textContent = theme === "light" ? "☀" : theme === "dark" ? "☾" : "💻";
      collapsedBtn.title = `Theme: ${theme} (Click to cycle)`;
    }
  }

  function cycleTheme() {
    const next = state.theme === "light" ? "dark" : state.theme === "dark" ? "system" : "light";
    applyTheme(next);
  }

  // Main Render Function
  function renderApp() {
    appContainer.innerHTML = `
      <!-- Mobile Header -->
      <header class="mobile-header">
        <div style="display:flex;align-items:center;gap:10px;font-weight:600;">
          <button type="button" id="mobile-menu-btn" style="background:var(--accent-soft);color:var(--accent);border:0;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span>my_kaneki</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button type="button" class="theme-collapsed-btn" style="display:flex;" onclick="window.KanekiApp.cycleTheme()">
            ${state.theme === "light" ? "☀" : state.theme === "dark" ? "☾" : "💻"}
          </button>
          <button type="button" class="quota-collapsed-btn" style="display:flex;" onclick="window.KanekiApp.openModal()">
            <svg class="quota-ring-svg" width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(-90deg)">
              <circle cx="12" cy="12" r="9" fill="none" stroke="var(--border)" stroke-width="3"/>
              <circle cx="12" cy="12" r="9" fill="none" stroke="var(--ok)" stroke-width="3" stroke-dasharray="56.5" stroke-dashoffset="${56.5 * (1 - data.quota.percentRemaining / 100)}" stroke-linecap="round"/>
            </svg>
            <span class="quota-collapsed-pct">${data.quota.percentRemaining}</span>
          </button>
        </div>
      </header>

      <!-- Collapsible Main Sidebar -->
      <aside class="sidebar ${state.collapsed ? "collapsed" : ""}" id="main-sidebar">
        <!-- Sidebar Header -->
        <div class="sidebar-header">
          <a href="#" class="sidebar-brand" onclick="window.KanekiApp.switchTab('agent'); return false;">
            <div class="sidebar-logo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            </div>
            <div class="sidebar-brand-text">
              <div class="sidebar-brand-title">my_kaneki</div>
              <div class="sidebar-brand-sub">Central Workspace</div>
            </div>
          </a>
          <button type="button" class="sidebar-collapse-btn" title="Collapse sidebar" onclick="window.KanekiApp.toggleCollapse()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>

        <!-- Sidebar Body Navigation -->
        <div class="sidebar-body">
          <div class="nav-group">
            <div class="nav-group-label">Workspace</div>
            <ul class="nav-list">
              ${data.navItems
                .map(
                  (item) => `
                <li>
                  <button type="button" class="nav-item-btn ${state.currentTab === item.id ? "active" : ""}" 
                    title="${item.label} — ${item.description}" 
                    onclick="window.KanekiApp.switchTab('${item.id}')">
                    <span class="nav-icon">${item.iconSvg}</span>
                    <span class="nav-label">${item.label}</span>
                  </button>
                </li>
              `
                )
                .join("")}
            </ul>
          </div>

          <div class="nav-group">
            <div class="nav-group-label">Connected Apps</div>
            <ul class="nav-list">
              ${data.externalApps
                .map(
                  (app) => `
                <li>
                  <a href="${app.href}" target="_blank" rel="noopener noreferrer" class="nav-item-btn" title="${app.label}">
                    <span class="nav-icon">${app.iconSvg}</span>
                    <span class="nav-label">${app.label}</span>
                    <svg class="nav-label" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto;opacity:0.6;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                </li>
              `
                )
                .join("")}
            </ul>
          </div>
        </div>

        <!-- Sidebar Footer (Option B1 Implementation) -->
        <div class="sidebar-footer">
          <!-- B1 AI Quota Card (Expanded) -->
          <div class="quota-card" title="Ollama Cloud quota: ${data.quota.percentRemaining}% remaining. Resets ${data.quota.resetAt}. Click for details." onclick="window.KanekiApp.openModal()">
            <div class="quota-card-head">
              <span class="quota-card-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                AI Quota
              </span>
              <span class="quota-card-val">${data.quota.percentRemaining}% left</span>
            </div>
            <div class="quota-progress-track">
              <div class="quota-progress-fill" style="width: ${data.quota.percentRemaining}%;"></div>
            </div>
            <div class="quota-card-foot">
              <span>Resets ${data.quota.resetAt}</span>
              <span>Details &rsaquo;</span>
            </div>
          </div>

          <!-- B1 Quota Button (Collapsed) -->
          <button type="button" class="quota-collapsed-btn" title="AI Quota: ${data.quota.percentRemaining}% left (Resets ${data.quota.resetAt})" onclick="window.KanekiApp.openModal()">
            <svg class="quota-ring-svg" width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(-90deg)">
              <circle cx="12" cy="12" r="9" fill="none" stroke="var(--border)" stroke-width="3"/>
              <circle cx="12" cy="12" r="9" fill="none" stroke="var(--ok)" stroke-width="3" stroke-dasharray="56.5" stroke-dashoffset="${56.5 * (1 - data.quota.percentRemaining / 100)}" stroke-linecap="round"/>
            </svg>
            <span class="quota-collapsed-pct">${data.quota.percentRemaining}</span>
          </button>

          <!-- Option B Segmented Theme Switch (Expanded) -->
          <div class="theme-segmented" role="group" aria-label="Theme switch">
            <button type="button" class="theme-seg-btn ${state.theme === "light" ? "active" : ""}" data-theme="light" onclick="window.KanekiApp.applyTheme('light')">
              ☀ Light
            </button>
            <button type="button" class="theme-seg-btn ${state.theme === "dark" ? "active" : ""}" data-theme="dark" onclick="window.KanekiApp.applyTheme('dark')">
              ☾ Dark
            </button>
            <button type="button" class="theme-seg-btn ${state.theme === "system" ? "active" : ""}" data-theme="system" onclick="window.KanekiApp.applyTheme('system')">
              💻 Auto
            </button>
          </div>

          <!-- Theme Button (Collapsed) -->
          <button type="button" class="theme-collapsed-btn" onclick="window.KanekiApp.cycleTheme()">
            ${state.theme === "light" ? "☀" : state.theme === "dark" ? "☾" : "💻"}
          </button>

          <!-- User Account Row -->
          <div class="user-footer-row">
            <div class="user-badge" title="${data.user.email}">
              <div class="user-avatar">${data.user.avatar}</div>
              <div class="user-info">
                <div class="user-name">${data.user.name}</div>
                <div class="user-email">${data.user.email}</div>
              </div>
            </div>
            <button type="button" class="btn-icon-danger" title="Log out" onclick="alert('Mock Log out')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>

          <!-- Expand button when collapsed -->
          <button type="button" class="sidebar-expand-btn" title="Expand sidebar" onclick="window.KanekiApp.toggleCollapse()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </aside>

      <!-- Main Content Container with Tabs -->
      <main class="main-view-container">
        <!-- Tab 1: Agent & Chat -->
        <section class="tab-content ${state.currentTab === "agent" ? "active" : ""}" id="tab-agent">
          ${renderAgentChatView()}
        </section>

        <!-- Tab 2: Self-Learning (LMS) -->
        <section class="tab-content ${state.currentTab === "learning" ? "active" : ""}" id="tab-learning">
          ${renderLearningView()}
        </section>

        <!-- Tab 3: Todos -->
        <section class="tab-content ${state.currentTab === "todos" ? "active" : ""}" id="tab-todos">
          ${renderTodosView()}
        </section>

        <!-- Tab 4: Notes -->
        <section class="tab-content ${state.currentTab === "notes" ? "active" : ""}" id="tab-notes">
          ${renderNotesView()}
        </section>

        <!-- Tab 5: Settings -->
        <section class="tab-content ${state.currentTab === "settings" ? "active" : ""}" id="tab-settings">
          ${renderSettingsView()}
        </section>
      </main>
    `;
  }

  // 1. Agent & Chat View
  function renderAgentChatView() {
    return `
      <div class="chat-app-shell">
        <aside class="sessions-sidebar">
          <div class="sessions-header">
            <span class="sessions-title">Chat Sessions</span>
            <button type="button" class="new-chat-btn" onclick="window.KanekiApp.newChat()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Chat
            </button>
          </div>
          <div class="sessions-list">
            ${data.chat.sessions
              .map(
                (s) => `
              <button type="button" class="session-item ${state.activeSessionId === s.id ? "active" : ""}" onclick="window.KanekiApp.selectSession('${s.id}')">
                <span class="session-item-title">${s.title}</span>
              </button>
            `
              )
              .join("")}
          </div>
        </aside>

        <section class="chat-canvas">
          <header class="chat-header">
            <div class="chat-header-title">
              <span>${data.chat.sessions.find((s) => s.id === state.activeSessionId)?.title || "New Chat"}</span>
              <span class="chat-model-badge">${data.chat.model}</span>
            </div>
          </header>

          <div class="chat-messages-container" id="chat-messages-list">
            ${state.chatMessages
              .map(
                (msg) => `
              <div class="message-card ${msg.role}">
                <div class="message-avatar">${msg.avatar}</div>
                <div class="message-body">
                  <div class="message-sender">${msg.sender}</div>
                  <div class="message-text">${msg.text}</div>
                  ${
                    msg.toolCall
                      ? `
                    <div class="tool-call-box">
                      <div class="tool-call-head">
                        <span>⚡ ${msg.toolCall.name}</span>
                        <span class="tool-call-status">✓ completed</span>
                      </div>
                      <div class="tool-call-body">
                        <div><strong>Args:</strong> ${msg.toolCall.args}</div>
                        <div style="margin-top:4px;"><strong>Result:</strong> ${msg.toolCall.result}</div>
                      </div>
                    </div>
                  `
                      : ""
                  }
                </div>
              </div>
            `
              )
              .join("")}
          </div>

          <div class="chat-input-bar">
            <div class="suggestions-row">
              ${data.chat.promptSuggestions
                .map(
                  (sug) => `
                <button type="button" class="suggestion-chip" onclick="window.KanekiApp.insertPrompt('${sug.prompt}')">
                  ${sug.label}
                </button>
              `
                )
                .join("")}
            </div>

            <form class="input-box-wrapper" onsubmit="window.KanekiApp.submitChatMessage(event)">
              <textarea class="chat-textarea" id="chat-input" placeholder="Ask a question, update notes, or manage tasks..." rows="1"></textarea>
              <button type="submit" class="send-btn" title="Send message">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </form>
          </div>
        </section>
      </div>
    `;
  }

  // 2. Learning View
  function renderLearningView() {
    return `
      <div class="lms-container">
        <div class="lms-hero">
          <div class="lms-title">${data.learning.subject}</div>
          <div class="lms-desc">${data.learning.description}</div>
          <div style="display:flex;gap:16px;margin-top:16px;font-size:12.5px;">
            <span><strong>${data.learning.stats.mastered}</strong> Mastered</span>
            <span><strong>${data.learning.stats.inProgress}</strong> In Progress</span>
            <span style="color:var(--warn);"><strong>${data.learning.stats.reviewDue}</strong> Reviews Due</span>
          </div>
        </div>

        <h3 style="font-size:16px;font-weight:600;">Syllabus Modules (DAG Prerequisite Path)</h3>
        <div class="lms-grid">
          ${data.learning.modules
            .map(
              (mod) => `
            <div class="lms-card">
              <div class="lms-card-header">
                <span class="lms-badge">${mod.tier}</span>
                <span style="font-size:11px;color:${mod.status === "Mastered" ? "var(--ok)" : mod.status === "Locked" ? "var(--muted)" : "var(--accent)"};font-weight:600;">
                  ${mod.status}
                </span>
              </div>
              <div class="lms-card-title">${mod.title}</div>
              <div class="lms-card-sub">Active recall quiz & synthetic research notes</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  // 3. Todos View
  function renderTodosView() {
    return `
      <div class="todos-container">
        <div class="todos-header">
          <h1 class="todos-title">Todo & Planning</h1>
          <div class="todos-tabs">
            <button class="todos-tab-btn active">All</button>
            <button class="todos-tab-btn">Pending</button>
          </div>
        </div>

        <form class="todo-add-form" onsubmit="window.KanekiApp.submitTodo(event)">
          <input type="text" id="todo-input" class="todo-input" placeholder="Add a new task..." required autocomplete="off"/>
          <button type="submit" class="todo-add-btn">Add</button>
        </form>

        <div class="todo-list">
          ${state.todos
            .map(
              (todo) => `
            <div class="todo-item">
              <div class="todo-checkbox ${todo.done ? "checked" : ""}" onclick="window.KanekiApp.toggleTodo(${todo.id})">
                ${todo.done ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ""}
              </div>
              <span class="todo-text ${todo.done ? "done" : ""}">${todo.title}</span>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  // 4. Notes View
  function renderNotesView() {
    return `
      <div class="notes-container">
        <div class="notes-file-tree">
          <div class="notes-tree-title">Workspace Notes</div>
          ${data.notes.files
            .map(
              (file, index) => `
            <button class="notes-file-item ${index === 0 ? "active" : ""}">
              📄 ${file.title}
            </button>
          `
            )
            .join("")}
        </div>
        <div class="notes-editor-pane">
          <h1 class="notes-doc-title">${data.notes.activeContent.title}</h1>
          <div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Last updated ${data.notes.activeContent.date}</div>
          <div class="notes-markdown-body">
            <pre style="font-family:var(--font-sans);white-space:pre-wrap;line-height:1.7;">${data.notes.activeContent.markdown}</pre>
          </div>
        </div>
      </div>
    `;
  }

  // 5. Settings View
  function renderSettingsView() {
    return `
      <div class="settings-container">
        <h1 style="font-size:20px;font-weight:700;">Settings & Integration</h1>
        <div class="settings-card">
          <h2 class="settings-card-title">AI Provider Configuration</h2>
          <div class="settings-row">
            <label class="settings-label">Ollama Model</label>
            <input class="settings-input" value="${data.settings.ollamaModel}" readonly/>
          </div>
          <div class="settings-row">
            <label class="settings-label">Base URL</label>
            <input class="settings-input" value="${data.settings.ollamaBaseUrl}" readonly/>
          </div>
        </div>

        <div class="settings-card">
          <h2 class="settings-card-title">Remote MCP Server</h2>
          <div class="settings-row">
            <label class="settings-label">my_pm_agent HTTP Endpoint</label>
            <input class="settings-input" value="${data.settings.mcpEndpoint}" readonly/>
          </div>
        </div>
      </div>
    `;
  }

  // Render Modal Dialog
  function renderModal() {
    modalBackdrop.innerHTML = `
      <div class="modal-box" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div class="modal-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Ollama Cloud Quota
          </div>
          <button type="button" class="modal-close-btn" onclick="window.KanekiApp.closeModal()">✕</button>
        </div>

        <div class="modal-stat-grid">
          <div class="modal-stat-cell">
            <div class="modal-stat-title">Remaining Balance</div>
            <div class="modal-stat-val" style="color:var(--ok);">$${data.quota.balanceUsd.toFixed(2)}</div>
          </div>
          <div class="modal-stat-cell">
            <div class="modal-stat-title">Monthly Allowance</div>
            <div class="modal-stat-val">$${data.quota.allowanceUsd.toFixed(2)}</div>
          </div>
          <div class="modal-stat-cell">
            <div class="modal-stat-title">Usage Percentage</div>
            <div class="modal-stat-val">${data.quota.percentRemaining}% left</div>
          </div>
          <div class="modal-stat-cell">
            <div class="modal-stat-title">Reset Timeline</div>
            <div class="modal-stat-val">${data.quota.resetAt}</div>
          </div>
        </div>

        <div style="font-size:12px;color:var(--muted);background:var(--surface-subtle);padding:10px 12px;border-radius:10px;border:1px solid var(--border);">
          <strong>24h Activity:</strong> ${data.quota.totals24h.requestCount} requests &bull; ${data.quota.totals24h.inputTokens} input &bull; ${data.quota.totals24h.outputTokens} output
        </div>
      </div>
    `;
  }

  function setupGlobalEvents() {
    modalBackdrop.addEventListener("click", () => closeModal());
  }

  // Public Methods
  function switchTab(tabId) {
    state.currentTab = tabId;
    renderApp();
  }

  function toggleCollapse() {
    state.collapsed = !state.collapsed;
    renderApp();
  }

  function openModal() {
    state.modalOpen = true;
    modalBackdrop.classList.add("open");
    renderModal();
  }

  function closeModal() {
    state.modalOpen = false;
    modalBackdrop.classList.remove("open");
  }

  function submitTodo(e) {
    e.preventDefault();
    const input = document.getElementById("todo-input");
    const val = input.value.trim();
    if (!val) return;
    state.todos.unshift({ id: Date.now(), title: val, done: false });
    input.value = "";
    document.getElementById("tab-todos").innerHTML = renderTodosView();
  }

  function toggleTodo(id) {
    const item = state.todos.find((t) => t.id === id);
    if (item) item.done = !item.done;
    document.getElementById("tab-todos").innerHTML = renderTodosView();
  }

  function insertPrompt(promptText) {
    const input = document.getElementById("chat-input");
    if (input) {
      input.value = promptText;
      input.focus();
    }
  }

  function submitChatMessage(e) {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const val = input.value.trim();
    if (!val) return;

    state.chatMessages.push({
      role: "user",
      sender: data.user.name,
      avatar: data.user.avatar,
      text: val,
    });

    state.chatMessages.push({
      role: "assistant",
      sender: "Kaneki Agent",
      avatar: "🤖",
      text: "I received your instruction: \"" + val + "\". Processing workspace action with connected tools...",
    });

    input.value = "";
    document.getElementById("tab-agent").innerHTML = renderAgentChatView();
    const container = document.getElementById("chat-messages-list");
    if (container) container.scrollTop = container.scrollHeight;
  }

  function newChat() {
    state.chatMessages = [
      {
        role: "assistant",
        sender: "Kaneki Agent",
        avatar: "🤖",
        text: "New session started. How can I assist you in your engineering workspace today?",
      },
    ];
    document.getElementById("tab-agent").innerHTML = renderAgentChatView();
  }

  function selectSession(id) {
    state.activeSessionId = id;
    renderApp();
  }

  // Export API to global window
  window.KanekiApp = {
    applyTheme,
    cycleTheme,
    switchTab,
    toggleCollapse,
    openModal,
    closeModal,
    submitTodo,
    toggleTodo,
    insertPrompt,
    submitChatMessage,
    newChat,
    selectSession,
  };

  // Launch
  init();
})();
