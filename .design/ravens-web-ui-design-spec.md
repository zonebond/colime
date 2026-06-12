# ravens Web UI 设计规范（纯粹版）

> 完全基于 `packages/ui/src/components/` 的源代码提取，不含 board 实现。

---

## 1. 架构层级

ravens Web UI 采用三层组件树：

```
SessionTurn (一回合 = user msg + assistant parts)
  ├─ Message (按 role 分发)
  │   ├─ UserMessageDisplay
  │   └─ AssistantMessageDisplay
  │       └─ AssistantParts → groupParts() → Index each group
  │           ├─ ContextToolGroup (折叠)
  │           └─ Part → Dynamic(PART_MAPPING[part.type])
  │               ├─ TextPartDisplay → Markdown / PacedMarkdown
  │               ├─ ToolPartDisplay → ToolRegistry.render() → BasicTool
  │               ├─ ReasoningPartDisplay → Markdown / PacedMarkdown
  │               └─ CompactionPartDisplay → MessageDivider
  ├─ ThinkingIndicator (TextShimmer + TextReveal)
  ├─ FileDiffs (Accordion, max 10 files)
  └─ ErrorCard
```

**关键设计**：每个 `SessionTurn` 是独立渲染单元，多个 turn 之间 `gap: 24px`（`[data-slot="session-turn-list"]`）。

---

## 2. 用户消息 (UserMessageDisplay)

### 布局

```
[data-component="user-message"]
  ├─ align-items: flex-end          ← 右对齐
  ├─ gap: 0
  │
  ├─ [data-slot="user-message-attachments"]      (可选)
  │   ├─ flex-wrap: wrap, justify-content: flex-end
  │   ├─ gap: 8px
  │   ├─ max-width: min(82%, 64ch)
  │   └─ [data-slot="user-message-attachment"]  ← 每项
  │       ├─ image: 48px × 48px, border-radius: 6px
  │       └─ file: min(220px, 100%) × 48px, padding: 0 10px
  │
  ├─ [data-slot="user-message-body"]             (文本)
  │   ├─ max-width: min(82%, 64ch)
  │   ├─ margin-left: auto
  │   └─ [data-slot="user-message-text"]
  │       ├─ background: var(--surface-base)
  │       ├─ border: 1px solid var(--border-weak-base)
  │       ├─ padding: 8px 12px
  │       ├─ border-radius: 6px
  │       └─ white-space: pre-wrap, word-break: break-word
  │
  └─ [data-slot="user-message-copy-wrapper"]     (操作栏)
      ├─ opacity: 0 → hover/focus-within: 1
      ├─ transition: opacity 0.15s ease
      ├─ min-height: 24px, margin-top: 4px
      ├─ gap: 10px
      └─ 包含：meta(agent · model · time) + revert btn + copy btn
```

### 关键参数

| 属性 | 值 | 来源 |
|------|-----|------|
| 对齐 | `align-items: flex-end` | `message-part.css:20` |
| 最大宽度 | `min(82%, 64ch)` | `message-part.css:32,117` |
| 气泡圆角 | `6px` | `message-part.css:136` |
| 气泡内边距 | `8px 12px` | `message-part.css:135` |
| 附件图片尺寸 | `48px × 48px` | `message-part.css:59` |
| 附件文件尺寸 | `min(220px, 100%) × 48px` | `message-part.css:64` |
| 操作栏渐显 | `opacity 0.15s ease` | `message-part.css:159` |
| 元数据分隔符 | ` · ` (中间点) | `message-part.tsx:1048` |

---

## 3. 助手消息 (AssistantMessageDisplay)

### 布局

```
[data-component="assistant-message"]
  ├─ content-visibility: auto        ← 渲染优化
  ├─ width: 100%
  ├─ align-items: flex-start         ← 左对齐
  ├─ gap: 12px
  │
  └─ AssistantParts (按 groupParts() 分组渲染)
      ├─ ContextToolGroup (折叠)
      └─ Part → Dynamic
```

**注意**：ravens Web UI 没有全局的 "responseHeader" 或 "responseModelLabel" — 模型信息只在 `TextPartDisplay` 的 copy-wrapper 中作为元数据行显示（`agent · model · duration · interrupted`）。

---

## 4. Part 映射与分组

### 4.1 PART_MAPPING 注册表

```tsx
export const PART_MAPPING: Record<string, PartComponent | undefined> = {}
PART_MAPPING["text"]       = TextPartDisplay      // Markdown / PacedMarkdown
PART_MAPPING["tool"]       = ToolPartDisplay      // → ToolRegistry.render(toolName)
PART_MAPPING["reasoning"]  = ReasoningPartDisplay   // Markdown / PacedMarkdown
PART_MAPPING["compaction"] = CompactionPartDisplay // 分隔线
```

`ToolPartDisplay` 通过 `ToolRegistry.render(toolName)` 查找专属渲染器，回退到 `GenericTool`。

### 4.2 groupParts() — Context 工具折叠

```tsx
const CONTEXT_GROUP_TOOLS = new Set(["read", "glob", "grep", "list"])

function groupParts(parts) {
  // 将连续的 context 工具（read/glob/grep/list）
  // 折叠为单个 "context" 组
  // 非 context 工具保持为独立的 "part" 项
}
```

**ContextToolGroup** 视觉设计：
- 使用 `Collapsible` + `variant="ghost"`
- Trigger：
  - `ToolStatusTitle` 动态文本（"Gathering context..." / "Gathered context"）
  - `AnimatedCountList` 显示 read/search/list 数量统计
  - `Collapsible.Arrow` 展开箭头
- Content：每项是 `BasicTool` trigger 的内联渲染（无展开箭头，纯展示）
- 列表内边距：`padding-left: 12px`
- 列表项间距：`gap: 4px`

---

## 5. 内容块类型

### 5.1 TextPartDisplay

```
[data-component="text-part"]
  ├─ width: 100%
  ├─ margin-top: 24px                   ← 与其他 part 的间距
  │
  ├─ [data-slot="text-part-body"]
  │   └─ Markdown / PacedMarkdown
  │
  └─ [data-slot="text-part-copy-wrapper"] (hover 渐显)
      ├─ opacity: 0 → hover: 1, 0.15s ease
      ├─ min-height: 24px, margin-top: 4px
      ├─ gap: 10px
      └─ 包含：copy btn + meta(agent · model · duration · interrupted)
```

### 5.2 ReasoningPartDisplay

```
[data-component="reasoning-part"]
  ├─ width: 100%
  ├─ color: var(--text-base)
  └─ [data-component="markdown"]
      ├─ margin-top: 16px
      ├─ font-size: 13px                ← 比正文小一号
      └─ color: var(--text-weak)         ← 弱化颜色
```

### 5.3 ToolPartDisplay

每个工具通过 `BasicTool` 组件渲染：

```
Collapsible (class="tool-collapsible")
  ├─ Collapsible.Trigger
  │   └─ [data-component="tool-trigger"]
  │       ├─ [data-slot="basic-tool-tool-trigger-content"]
  │       │   └─ [data-slot="basic-tool-tool-info"]
  │       │       ├─ title (TextShimmer 动画)
  │       │       ├─ subtitle
  │       │       └─ args
  │       └─ Collapsible.Arrow (hover 显示)
  └─ Collapsible.Content (spring 动画展开)
      └─ 工具专属内容
```

**BasicTool Trigger 结构**：
- `title`：`font-size: 14px, font-weight: 500, color: var(--text-strong)`
- `subtitle`：`flex-shrink: 1, min-width: 0, overflow: hidden, text-overflow: ellipsis, white-space: nowrap, font-size: 14px, color: var(--text-base)`
- `args`：小标签样式
- `action`：右侧操作按钮
- 运行中时 title 用 `TextShimmer` 动画

**展开动画**：
```
spring: { type: "spring", visualDuration: 0.35, bounce: 0 }
```
- 打开：`height: "auto"`
- 关闭：`height: "0px"`
- 过渡期间 `overflow: hidden`，完成后 `overflow: visible`

### 5.4 CompactionPartDisplay

```
[data-component="compaction-part"]
  ├─ 全宽 flex 列
  └─ [data-slot="compaction-part-divider"]
      ├─ flex 两端线条：height: 1px, background: var(--border-weak-base)
      └─ 中间标签：padding: 10px 0
```

---

## 6. 流式渲染 (Streaming)

### 6.1 PacedMarkdown

```tsx
const TEXT_RENDER_PACE_MS = 24
const TEXT_RENDER_SNAP = /[\s.,!?;:)]/

function createPacedValue(getValue, getLive) {
  // 步长自适应：2, 4, 8, up to 24 chars per tick
  // 对齐到词边界（正则匹配）
  // 仅当 streaming=true 时 pacing
  // 非流式或回退时直接渲染完整文本
}
```

| 参数 | 值 |
|------|-----|
| 基础步长间隔 | `24ms` |
| 词边界对齐 | `/[\s.,!?;:)]/` |
| 步长策略 | 自适应：2, 4, 8, up to 24 字符/步 |
| 回退行为 | 文本回退或完成时直接显示完整内容 |

### 6.2 TextShimmer (工具标题动画)

```
[data-component="text-shimmer"]
  ├─ --text-shimmer-swap: 220ms
  ├─ --text-shimmer-index: offset
  │
  └─ 双层文字：
      ├─ base 层：默认颜色
      └─ shimmer 层：渐变扫光动画，active 时显示
```

- 渐变扫光：`linear-gradient` + `background-position` 动画
- 基础色 → 峰值色 → 基础色的扫过效果
- 延迟停用：220ms fade-out，避免闪烁

---

## 7. 自动滚动 (createAutoScroll)

### API

```tsx
const autoScroll = createAutoScroll({
  working,                    // () => boolean — 是否正在流式输出
  onUserInteracted?,          // 用户手动滚动时回调
  overflowAnchor?: "dynamic", // 动态 overflow-anchor
  bottomThreshold?: 10,       // 距离底部阈值(px)
})
```

### 返回方法

| 方法 | 说明 |
|------|------|
| `scrollRef` | 滚动容器 ref setter |
| `contentRef` | 内容容器 ref setter |
| `handleScroll` | 绑定到 scroll 事件 |
| `handleInteraction` | 绑定到 click — 检测文本选择 |
| `pause` | 标记用户已手动滚动 |
| `resume` | 清除 userScrolled 并滚动到底部 |
| `scrollToBottom` | 条件滚动到底部（非强制） |
| `forceScrollToBottom` | 强制滚动到底部 |
| `userScrolled` | 读取用户滚动状态 |

### 行为

1. **ResizeObserver** 监听内容变化 → 若未 userScrolled 且 working，立即滚动到底部
2. **Wheel 事件** → 向上滚动时标记 userScrolled（跳过嵌套 `data-scrollable` 区域）
3. **Scroll 事件** → 检测是否滚动到底部（阈值 10px），否则标记 userScrolled
4. **Auto 标记** → `scrollToBottom` 调用后 1500ms 内忽略 scroll 事件（避免误判）
5. **Settling** → working 结束后 300ms 内保持 settling 状态，继续自动滚动
6. **OverflowAnchor** → `userScrolled ? "auto" : "none"`（dynamic 模式）

---

## 8. 输入区域 (DockPrompt)

ravens Web UI 不提供全局 Composer，而是针对 question/permission 提供 docked prompt：

```
[data-component="dock-prompt"][data-kind="question" | "permission"]
  ├─ DockShell
  │   ├─ [data-slot="{kind}-header"]
  │   ├─ [data-slot="{kind}-body"]    ← 主内容区
  │   └─ [data-slot="{kind}-content"]
  └─ DockTray
      └─ [data-slot="{kind}-footer"]   ← 操作按钮
```

### Permission 布局

- `gap: 16px`, `padding: 12px 12px 0`
- Permission row：`grid-template-columns: 20px 1fr`, `gap: 8px`
- Patterns list：`flex-direction: column, gap: 6px`, 滚动隐藏
- Footer：`padding: 32px 8px 8px, margin-top: -24px`
- Actions：`gap: 8px`

### Question 布局

- Header：`justify-content: space-between`, `padding: 0 10px`
- Progress segments：`16px` 圆形按钮，`width: 16px, height: 2px` 线条
- Options：`flex-direction: column, gap: 6px`, `padding: 1px 1px 8px`
- Option card：`border-radius: 6px`, `padding: 8px 8px 8px 10px`
- Custom input：`padding-left: 36px`, 无边框文本域

---

## 9. 主题系统

### 9.1 CSS 自定义属性（Token）

ravens 定义了 300+ CSS 变量，以下是核心分类：

**字体**

| Token | 值 |
|-------|-----|
| `--font-family-sans` | `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| `--font-family-mono` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` |
| `--font-size-small` | `13px` |
| `--font-size-base` | `14px` |
| `--font-size-large` | `16px` |
| `--font-weight-regular` | `400` |
| `--font-weight-medium` | `500` |
| `--line-height-normal` | `130%` |
| `--line-height-large` | `150%` |

**圆角**

| Token | 值 |
|-------|-----|
| `--radius-xs` | `0.125rem` (2px) |
| `--radius-sm` | `0.25rem` (4px) |
| `--radius-md` | `0.375rem` (6px) |
| `--radius-lg` | `0.5rem` (8px) |
| `--radius-xl` | `0.625rem` (10px) |

**颜色（Light Mode）**

| Token | 值 |
|-------|-----|
| `--background-base` | `#f8f8f8` |
| `--background-stronger` | `#fcfcfc` |
| `--surface-base` | `rgba(0,0,0,0.031)` |
| `--surface-weak` | `rgba(0,0,0,0.051)` |
| `--text-strong` | `#171717` |
| `--text-base` | `#6f6f6f` |
| `--text-weak` | `#8f8f8f` |
| `--text-weaker` | `#c7c7c7` |
| `--border-weak-base` | `#e5e5e5` |
| `--border-weaker-base` | `#f0f0f0` |
| `--text-interactive-base` | `#034cff` |

**颜色（Dark Mode）**

| Token | 值 |
|-------|-----|
| `--background-base` | `#101010` |
| `--background-stronger` | `#151515` |
| `--surface-base` | `rgba(255,255,255,0.031)` |
| `--surface-weak` | `rgba(255,255,255,0.078)` |
| `--text-strong` | `rgba(255,255,255,0.936)` |
| `--text-base` | `rgba(255,255,255,0.618)` |
| `--text-weak` | `rgba(255,255,255,0.422)` |
| `--text-weaker` | `rgba(255,255,255,0.284)` |
| `--border-weak-base` | `#282828` |
| `--border-weaker-base` | `#202020` |
| `--text-interactive-base` | `#9dbefe` |

### 9.2 间距

ravens 未定义显式间距 token 层级，而是使用具体数值：
- 紧凑：`4px`（gap、meta margin）
- 标准：`8px`（附件 gap、按钮 gap）
- 中等：`12px`（section gap、padding）
- 较大：`16px`（margin-top、diff view padding）
- 大：`24px`（text-part margin-top、turn gap）

---

## 10. 性能优化

| 技术 | 实现 | 位置 |
|------|------|------|
| `content-visibility: auto` | 助手消息容器 | `message-part.css:2` |
| 无虚拟化 | 全量挂载 | 无虚拟滚动库 |
| 懒挂载 (`defer`) | `BasicTool` 内容延迟渲染 | `basic-tool.tsx:77` |
| `requestAnimationFrame` | diff view 延迟挂载 | `session-turn.tsx:475` |
| 隐藏滚动条 | `scrollbar-width: none` | 多处 |

---

## 11. 动画规格

| 动画 | 时长 | 缓动 | 触发条件 |
|------|------|------|----------|
| Copy-wrapper hover | `0.15s` | `ease` | hover / focus-within |
| Collapsible height | `0.35s` | `spring, bounce: 0` | 展开/收起 |
| TextShimmer swap | `220ms` | - | active → inactive |
| TextShimmer sweep | `1200ms` | `linear infinite` | active |
| ShellSubmessage width | `0.25s` | `spring, bounce: 0` | 挂载 |
| ShellSubmessage blur | `0.32s` | `[0.16, 1, 0.3, 1]` | 挂载 |
| Diff chevron rotate | `0.15s` | `ease` | 展开/收起 |
| Diff toggle opacity | `0.15s` | `ease` | hover |
| Auto-scroll settling | `300ms` | - | working 结束后 |
| Auto-scroll mark | `1500ms` | - | scrollToBottom 后 |

---

## 12. 与 board 的关键差异

| 方面 | ravens Web UI | board |
|------|-----------------|-------|
| 用户消息圆角 | `6px` | `16px` |
| 用户消息最大宽度 | `min(82%, 64ch)` | `min(85%, 75ch)` |
| 虚拟化 | 无，`content-visibility: auto` | `@tanstack/react-virtual` |
| 流式文本 | `PacedMarkdown` 24ms/步打字机 | `charAnimated` 单字符渐入 |
| Part 分组 | `ContextToolGroup` 折叠 read/glob/grep/list | 无分组 |
| 助手元数据位置 | TextPart copy-wrapper 底部 | responseHeader 顶部 pill |
| 自动滚动 | `ResizeObserver` + userScrolled 检测 | 自行管理 |
| Composer | `DockPrompt` (question/permission only) | 全局底部 Composer |
| 消息间距 | `gap: 24px` (turn 间) | `gap: 22px` |
| 代码块 | `Markdown` 组件渲染 | 自定义 `CodeBlock` |
| 入场动画 | 无页面级入场动画 | pageEnter / headerEnter / contentEnter |
