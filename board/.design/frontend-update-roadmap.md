# Frontend Update Roadmap - Post Backend Implementation

**Generated**: 2026-04-17
**Status**: Backend 11/11 dimensions complete, P0/P1 optimizations complete
**Goal**: Map all backend capabilities → frontend UI updates

---

## 📊 Backend → Frontend Gap Analysis

| 后端功能 | 前端状态 | 需要更新的组件 | 优先级 |
|----------|----------|----------------|--------|
| **多代理系统** (spawn/stop/list) | ⚠️ 部分 | AgentsPage.jsx, ChatPage.jsx, InteractionPanel.jsx | P0 |
| **会话层级** (parent-child) | ❌ 缺失 | Sidebar.jsx, ChatPage.jsx (breadcrumb) | P0 |
| **权限系统** (rules + wildcards) | ⚠️ 部分 | ToolConfirmCard.jsx, InteractionPanel.jsx | P0 |
| **MCP 集成** (stdio transport) | ⚠️ 部分 | McpPage.jsx, McpServerItem.jsx | P1 |
| **上下文管理** (token counting) | ❌ 缺失 | ChatPage.jsx (status bar) | P1 |
| **缓存指标** (hit/miss tracking) | ❌ 缺失 | 新组件: CacheMetricsPanel.jsx | P1 |
| **消息分页** (cursor-based) | ⚠️ 部分 | ChatPage.jsx, chats.hooks.js | P1 |
| **代理通信** (mailbox) | ❌ 缺失 | 新组件: AgentMailbox.jsx | P2 |
| **Agent 循环** (state machine) | ⚠️ 部分 | ChatPage.jsx (status indicators) | P1 |
| **并行执行** (concurrency) | ❌ 缺失 | ChatPage.jsx (parallel task UI) | P2 |
| **系统提示** (layered) | ❌ 缺失 | 新组件: PromptEditor.jsx | P2 |

---

## 🎯 Phase 1: Critical UI Updates (Week 1)

### 1.1 Multi-Agent UI Enhancements
**File**: `src/components/toolbox/AgentsPage.jsx`
**Current**: Only shows agent list with toggle
**Needs**:
- Agent status indicator (running/idle/error/stopped)
- Agent spawning UI with mode selection (single/coordinator/swarm)
- Active agents count badge
- Agent role display (researcher/implementer/verifier)

**File**: `src/components/chats/ChatPage.jsx`
**Needs**:
- Active agent indicator in chat header
- Multi-agent status bar
- Agent switching UI

**New File**: `src/components/chats/AgentStatusBar.jsx`
- Shows active agents in current chat
- Agent status colors (green=running, yellow=thinking, red=error)
- Quick agent stop button

### 1.2 Session Hierarchy Navigation
**File**: `src/components/sidebar/Sidebar.jsx`
**Needs**:
- Session tree view (parent → children)
- Collapse/expand session groups
- Session breadcrumb path

**File**: `src/components/chats/ChatPage.jsx`
**Needs**:
- Session breadcrumb navigation (Parent → Child → Grandchild)
- "Back to parent" button
- Child sessions list

**New File**: `src/components/sidebar/SessionTreeItem.jsx`
- Recursive tree node for session hierarchy
- Indentation based on depth
- Active session highlighting

### 1.3 Permission System UI
**File**: `src/components/chats/ToolConfirmCard.jsx`
**Needs**:
- Permission scope display (global/project/session)
- Rule match indicator
- "Always allow for this project" option
- Permission rule preview

**File**: `src/components/chats/InteractionPanel.jsx`
**Needs**:
- Permission history log
- Rule management quick access
- Permission scope selector

**New File**: `src/components/chats/PermissionRulesPanel.jsx`
- List of active permission rules
- Rule editor (pattern + action)
- Rule priority display

---

## 🔧 Phase 2: Essential Integrations (Week 2)

### 2.1 MCP Server Status
**File**: `src/components/toolbox/McpPage.jsx`
**Needs**:
- Connection status badge (connected/connecting/disconnected/error)
- Tool count display per server
- Server health indicator
- Connection retry button

**File**: `src/components/toolbox/McpServerItem.jsx`
**Needs**:
- Status color indicator
- Last connection time
- Tool list preview
- Connection error message

### 2.2 Context Management Display
**File**: `src/components/chats/ChatPage.jsx`
**Needs**:
- Token usage bar (current/limit)
- Context compression indicator
- Window budget display
- Token breakdown (input/output/cache)

**New File**: `src/components/chats/TokenUsageBar.jsx`
- Visual progress bar
- Percentage display
- Color coding (green < 70%, yellow < 90%, red > 90%)
- Tooltip with breakdown

### 2.3 Message Pagination
**File**: `src/features/chats/chats.hooks.js`
**Needs**:
- Cursor-based pagination support
- "Load more" trigger
- Loading state for pagination

**File**: `src/components/chats/ChatPage.jsx`
**Needs**:
- "Load more messages" button at top
- Loading skeleton for older messages
- Scroll position restoration

---

## 📈 Phase 3: Advanced Features (Week 3)

### 3.1 Cache Metrics Panel
**New File**: `src/components/debug/CacheMetricsPanel.jsx`
- Cache hit/miss ratio
- Average latency comparison
- Cache size display
- Clear cache button

### 3.2 Agent Communication Timeline
**New File**: `src/components/chats/AgentMailbox.jsx`
- Agent-to-agent message history
- Message routing visualization
- Broadcast/group indicators

### 3.3 Permission History Log
**New File**: `src/components/chats/PermissionHistoryLog.jsx`
- Recent permission decisions
- Rule match details
- Quick revert option

### 3.4 Token Breakdown Display
**New File**: `src/components/chats/TokenBreakdown.jsx`
- Input tokens breakdown
- Output tokens breakdown
- Cache tokens breakdown
- Cost estimation

---

## 🔌 Data Layer Updates

### New Hooks Required

```javascript
// features/chats/chats.hooks.js
useSessionHierarchy(chatId)     // Get parent/child sessions
useTokenUsage(chatId)           // Get current token usage
useActiveAgents(chatId)         // Get active agents in chat
usePermissionRules(scope)       // Get permission rules
useMessagePagination(chatId)    // Cursor-based pagination

// features/toolbox/toolbox.hooks.js
useMcpServerStatus(serverId)    // Real-time connection status
useAgentStatus(agentId)         // Real-time agent status
useCacheMetrics()               // Cache performance data
```

### New API Endpoints Needed

```javascript
// features/chats/chats.service.js
getSessionHierarchy(chatId)
getTokenUsage(chatId)
getActiveAgents(chatId)
paginateMessages(chatId, cursor, limit)

// features/toolbox/toolbox.service.js
getMcpServerStatus(serverId)
getAgentStatus(agentId)
getCacheMetrics()
spawnAgent(config)
stopAgent(agentId)
sendAgentMessage(fromAgent, toAgent, message)
```

---

## 🌍 i18n Keys to Add

```javascript
// i18n/en.js
agentStatus: {
  running: 'Running',
  idle: 'Idle',
  thinking: 'Thinking',
  executingTools: 'Executing tools',
  waiting: 'Waiting',
  completed: 'Completed',
  failed: 'Failed',
  stopped: 'Stopped',
  timeout: 'Timeout',
},
sessionHierarchy: {
  parent: 'Parent session',
  child: 'Child session',
  branch: 'Branch',
  backToParent: 'Back to parent',
  childSessions: 'Child sessions',
},
permissions: {
  allow: 'Allow',
  deny: 'Deny',
  alwaysAllow: 'Always allow',
  scope: 'Permission scope',
  rule: 'Permission rule',
  globalScope: 'Global',
  projectScope: 'Project',
  sessionScope: 'Session',
},
context: {
  tokens: 'Tokens',
  inputTokens: 'Input',
  outputTokens: 'Output',
  cacheTokens: 'Cache',
  tokenLimit: 'Token limit',
  compaction: 'Context compaction',
},
cache: {
  hitRate: 'Hit rate',
  avgLatency: 'Avg latency',
  cacheSize: 'Cache size',
  clearCache: 'Clear cache',
},
pagination: {
  loadMore: 'Load more messages',
  loading: 'Loading...',
},
agentCommunication: {
  mailbox: 'Agent mailbox',
  message: 'Agent message',
  routing: 'Message routing',
  broadcast: 'Broadcast',
},
mcp: {
  connected: 'Connected',
  connecting: 'Connecting',
  disconnected: 'Disconnected',
  error: 'Connection error',
  retry: 'Retry connection',
  toolCount: '{count} tools',
},
```

---

## 📋 Implementation Order

| Week | Priority | Task | Components |
|------|----------|------|------------|
| 1 | P0 | Multi-agent UI | AgentsPage, AgentStatusBar |
| 1 | P0 | Session hierarchy | Sidebar, SessionTreeItem |
| 1 | P0 | Permission UI | ToolConfirmCard, PermissionRulesPanel |
| 2 | P1 | MCP status | McpPage, McpServerItem |
| 2 | P1 | Token usage | TokenUsageBar |
| 2 | P1 | Message pagination | ChatPage, chats.hooks |
| 3 | P2 | Cache metrics | CacheMetricsPanel |
| 3 | P2 | Agent communication | AgentMailbox |
| 3 | P2 | Permission history | PermissionHistoryLog |

---

## ✅ Success Criteria

- [ ] All 11 backend dimensions have corresponding frontend UI
- [ ] Real-time status updates for agents, MCP, permissions
- [ ] Session hierarchy navigation works smoothly
- [ ] Token usage visible and actionable
- [ ] Message pagination handles 1000+ messages
- [ ] Cache metrics provide optimization insights
- [ ] All i18n keys translated (en + zh)

---

## 📚 Reference Files

- **Claude Code UI patterns**: `claude-code-analysis/src/components/`
- **Current frontend**: `src/components/chats/ChatPage.jsx` (3063 LOC)
- **Backend protocol**: `ravens.runtime/src/modules/runtime/protocol.js`
- **Backend hooks**: `src/features/chats/chats.hooks.js` (1112 LOC)
