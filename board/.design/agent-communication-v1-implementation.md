# 代理通信 v1 实现总结

**实现日期**: 2026-04-17
**状态**: ✅ 已完成

---

## 实现内容

### 1. 修复 spawn_agent 为非阻塞模式 (`subagents/service.js`)
- **问题**: 原实现是生成器函数，等待 agent 完成才返回
- **解决方案**: 重构为异步函数，启动 agent 后立即返回 agentId 和状态
- **关键改动**:
  - 添加 `activeAgents` Map 存储运行中的 agent
  - 添加 `registerActiveAgent`、`unregisterActiveAgent`、`getActiveAgent` 函数
  - `spawnAgent` 启动 agent 后立即返回 `{ agentId, role, status: 'running' }`
  - agent 在后台异步执行，完成后更新状态
  - `stopAgent` 现在可以真正中止 agent

### 2. 实现 mailbox 核心模块 (`subagents/mailbox.js`)
- **架构**: 内存型 mailbox（非文件型，简化实现）
- **核心 API**:
  - `createSwarmMailbox(runId)`: 创建 swarm mailbox
  - `registerAgentMailbox(runId, agentId)`: 注册 agent mailbox
  - `sendAgentMessage(runId, message)`: 发送消息到指定 agent
  - `broadcastAgentMessage(runId, senderAgentId, message)`: 广播消息到所有 agent
  - `drainAgentMailbox(runId, agentId)`: 获取并清空 agent 的消息
  - `waitForAgentMessage(runId, agentId, options)`: 等待消息（带超时）
  - `getMailboxSnapshot(runId)`: 获取 mailbox 状态快照

- **消息格式**:
```javascript
{
  id: "msg_runId_1",
  runId: "run_abc",
  from: { agentId: "researcher-1", name: "researcher-1", role: "researcher" },
  to: { type: "agent", target: "implementer-1" },
  summary: "found config entrypoint",
  content: "The runtime config is loaded in ...",
  kind: "text",
  createdAt: 1713333333333,
  correlationId: null
}
```

- **特性**:
  - 支持等待模式（waiters 队列）
  - 支持超时机制
  - 支持消息日志记录
  - 支持 unread 计数

### 3. 更新工具定义 (`tools/multiAgent.js`)
- `spawn_agent` 工具现在使用非阻塞 API
- 返回 `{ agentId, role, status: 'running', message: 'Agent xxx started' }`

---

## 文件结构

```
ravens.runtime/src/modules/
├── runtime/
│   └── subagents/
│       ├── service.js       # 重构：非阻塞 agent 生成
│       └── mailbox.js       # 新增：内存型 mailbox
└── tools/
    └── multiAgent.js        # 更新：使用非阻塞 API
```

---

## 关键改进

### 修复前（阻塞模式）
```javascript
// 等待 agent 完成才返回
const generator = spawnAgent(...)
let result = null
while (true) {
  const { value, done } = await generator.next()
  if (done) {
    result = value  // 只有这里才返回
    break
  }
}
```

### 修复后（非阻塞模式）
```javascript
// 立即返回，agent 在后台运行
const result = await spawnAgent(...)
// result = { agentId: "researcher-1", status: "running", ... }
// agent 继续在后台执行
```

---

## 下一步

### Phase 3: 消息投递（注入 agent 提示）
- 在 agent 每次执行前，调用 `drainAgentMailbox` 获取消息
- 将消息注入到 agent 的提示中
- 格式示例：
```xml
<agent_message from="researcher-1" summary="found config entrypoint">
The runtime config is loaded in ...
</agent_message>
```

### Phase 4: send_message 工具
- 添加 `send_message` 工具到 `multiAgent.js`
- 支持直接发送和广播
- 验证收件人存在且活跃

### Phase 5: 可观察性
- 添加 SSE 事件：`agent_message_sent`、`agent_message_received`
- 更新 run store 记录消息日志

---

## 限制（v1）

- ❌ 仅支持内存型 mailbox（无文件持久化）
- ❌ 无消息路由（bridge/UDS）
- ❌ 无结构化控制消息（permission_request、shutdown_request 等）
- ❌ 无跨会话通信
- ❌ agent 完成后 mailbox 关闭

---

## 统计

- **实现维度**: 3/12（内存 + 多代理 + 代理通信）
- **完成度**: 25%
- **下一个关键差距**: MCP 集成
