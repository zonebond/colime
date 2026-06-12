# 对话界面设计要点

> 基于 ravens Web UI (`packages/ui`) 的设计，结合 board 现有实现，提炼可落地的设计规范。

---

## 1. 页面结构

```
┌─────────────────────────────────────────────────┐
│  Header (sticky, 48px)                          │
│  项目名 · 会话标题 | 操作按钮                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ScrollArea (flex:1, overflow-y:auto)           │
│  ┌───────────────────────────────────────────┐  │
│  │  Content (max-width:768px, margin:auto)   │  │
│  │                                           │  │
│  │  [日期分隔线]                              │  │
│  │  UserMessageRow (右对齐)                  │  │
│  │  AssistantMessageRow (左对齐, 全宽)        │  │
│  │  UserMessageRow                           │  │
│  │  AssistantMessageRow                       │  │
│  │  ...                                      │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
├─────────────────────────────────────────────────┤
│  Composer (sticky bottom, max-width:800px)      │
│  [附件预览] [输入框] [模型选择] [发送]              │
└─────────────────────────────────────────────────┘
```

### 关键参数

| 属性 | 值 | 说明 |
|------|-----|------|
| 内容区最大宽度 | `768px` (board) / `min(82%, 64ch)` (ravens) | board 已定 768px |
| Composer 最大宽度 | `800px` | 比内容区稍宽，视觉平衡 |
| 消息间距 | `22px` | `MESSAGE_GAP` |
| 日期分隔上下 padding | `12px 0 8px` | 轻量分隔 |
| Composer 底部 padding | `24px 16px 16px` | 底部安全距离 |
| 滚动区底部渐变 | `80px height, linear-gradient(transparent → main-bg)` | 遮挡 Composer 下边缘 |

---

## 2. 用户消息 (UserMessage)

### 布局

```
                    ┌─ userSection (align-items: flex-end) ──┐
                    │                                         │
                    │  ┌─ userAttachments (flex-wrap, gap:8) ┐│
                    │  │  [img 48×48] [file 220×48] [file]  ││
                    │  └─────────────────────────────────────┘│
                    │                                         │
                    │  ┌─ userBubble ──────────────────────┐ │
                    │  │  max-width: min(85%, 75ch)          │ │
                    │  │  padding: 14px 16px                 │ │
                    │  │  border-radius: 16px                │ │
                    │  │  background: --surface-soft          │ │
                    │  │  用户输入的文字内容...               │ │
                    │  └─────────────────────────────────────┘ │
                    │                                         │
                    │  userActions (opacity:0 → hover:1)      │
                    │  时间 · 复制 · 编辑 · 重试 · 更多       │
                    └─────────────────────────────────────────┘
```

### 设计要点

| 属性 | 值 | 说明 |
|------|-----|------|
| 对齐 | `align-items: flex-end` | 右对齐，视觉区分于助手 |
| 气泡最大宽度 | `min(85%, 75ch)` | 约 75 字符宽度，长文换行 |
| 圆角 | `16px` | 大圆角，对话感 |
| 内边距 | `14px 16px` | 舒适的阅读间距 |
| 背景 | `--surface-soft` | 轻微提亮，区别于背景 |
| 操作栏 | 默认 `opacity:0`，hover `opacity:1` | 渐显 140ms ease |
| 附件预览 | `80×80px` 圆角卡片，类型渐变背景 | 入场动画 260ms |

---

## 3. 助手消息 (AssistantMessage)

### 布局

```
┌─ responseBlock (flex-col, gap:4px) ────────────────┐
│                                                      │
│  ┌─ responseHeader (margin-top:8px) ───────────────┐│
│  │  [模型标签 pill]                                  ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  ┌─ AssistantStatus ───────────────────────────────┐│
│  │  思考中... / 工具调用状态 / 错误信息             ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  ┌─ AssistantBlocks ───────────────────────────────┐│
│  │  ┌─ contentBlocks ───────────────────────────┐   ││
│  │  │  [FileBlock]                              │   ││
│  │  │  [TextBlock] → responseBodyText           │   ││
│  │  │    └ responseMarkdown                     │   ││
│  │  │       gap:14px, font-size:15px, lh:1.75    │   ││
│  │  │  [ToolResultBlock]                         │   ││
│  │  │  [ThinkingBlock]                           │   ││
│  │  └───────────────────────────────────────────┘   ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  responseActions (opacity:0 → hover:1, margin-top:6)│
│  复制 · 重试(模型菜单) · 👍 · 👎 · 更多             │
└──────────────────────────────────────────────────────┘
```

### 设计要点

| 属性 | 值 | 说明 |
|------|-----|------|
| 对齐 | `flex-start`（左对齐，全宽） | 与用户消息形成对比 |
| 内容区 | `padding-left: 8px` | 轻微缩进 |
| 模型标签 | `pill` 样式，`border-radius:6px`, `1px 8px padding` | 小型胶囊标签 |
| 思考状态 | `thinkingRow`: dots 动画，1.2s 循环 | 三个点脉冲动画 |
| 操作栏 | `opacity:0 → hover:1`, 140ms | 与用户消息一致 |
| 操作栏间距 | `gap:4px` | 紧凑排列 |

---

## 4. 内容块类型 (Content Blocks)

### 4.1 文本块 (Text/Markdown)

```
┌─ responseBodyText (padding-left:8px) ─────┐
│  ┌─ responseMarkdown ───────────────────┐  │
│  │  gap: 14px                            │  │
│  │  font-size: 15px                      │  │
│  │  line-height: 1.75                    │  │
│  │                                       │  │
│  │  [段落文本]                            │  │
│  │  [标题 h1-h4: 17px, 700]              │  │
│  │  [列表: padding-left:24px, gap:6px]  │  │
│  │  [代码块: 见下方]                     │  │
│  │  [引用: 左边框 3px, 圆角 12px]       │  │
│  │  [表格: border-radius 8px]           │  │
│  └───────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### 4.2 代码块 (CodeBlock)

```
┌─ codeBlockWrap (border-radius:12px) ────────────┐
│  ┌─ codeBlockHeader ──────────────────────────┐ │
│  │  [语言标签] [展开] [复制] [运行]           │ │
│  └────────────────────────────────────────────┘ │
│  ┌─ codeBlockBody ────────────────────────────┐ │
│  │  lineNumbers │ code (font:mono, 13px, 1.75) │ │
│  │  1 │ const x = 1                           │ │
│  │  2 │ ...                                    │ │
│  └────────────────────────────────────────────┘ │
│  ┌─ codeOutput (可选) ────────────────────────┐ │
│  │  输出结果                                   │ │
│  └────────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

**折叠阈值**: 超过 20 行自动折叠，显示 "Show more" 按钮，折叠时 `max-height: 340px` + 渐变遮罩。

### 4.3 工具调用块 (ToolResultBlock)

```
┌─ toolResultBlock (border-radius:8px) ──────────────────┐
│  状态色背景:                                             │
│  · running:  color-mix(#6cbf7b 4%, transparent)         │
│  · done:     color-mix(--surface 40%, transparent)       │
│  · confirm:  color-mix(#f59e0b 5%, transparent)         │
│  · error:    color-mix(#ef4444 5%, transparent)         │
│                                                          │
│  ┌─ toolResultToggle (padding:10px 12px) ─────────────┐ │
│  │  [图标 20px] [工具名 mono 13px] [耗时]     [▸]    │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌─ toolResultBody (grid-template-rows: 0fr → 1fr) ──┐ │
│  │  ┌─ toolResultContent (padding:0 12px 10px) ─────┐ │ │
│  │  │  [输入参数] (mono 12px, bg:surface)            │ │ │
│  │  │  [输出结果] (mono 12px, max-height:200px)     │ │ │
│  │  │  [进度条] (height:4px, accent色)               │ │ │
│  │  │  [确认按钮行]                                  │ │ │
│  │  └────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

**展开动画**: `grid-template-rows: 0fr → 1fr`, `250ms cubic-bezier(0.16, 1, 0.3, 1)`

### 4.4 思考块 (ThinkingBlock)

独立组件 `ThinkingBlock`，样式与 `thinkingRow` 一致：
- 脉冲动画 dots (`1.2s ease-in-out infinite`)
- `font-size: 13px`, `font-weight: 500`

### 4.5 文件块 (FileBlock)

```
┌─ fileBlock (padding:12px 16px, border-radius:10px) ──┐
│  [文件图标 24px] [文件名 14px, font-weight:500]     │
└──────────────────────────────────────────────────────┘
```

---

## 5. 流式渲染 (Streaming)

### 5.1 文本流式

| 组件 | 说明 |
|------|------|
| `StreamingTail` | 流式文本尾段，`settle` 动画 180ms |
| `charAnimated` | 单字符渐入动画，`1s cubic-bezier(0.22, 1, 0.36, 1)`，`text-shadow: 0 0 16px var(--accent)` |
| `streamingCursor` | 光标块，`0.5em × 0.8em`，`cursorFade 1.5s infinite` |
| `StreamingTable` | 行级动画，`tableRowFadeIn 0.4s ease-out` |

### 5.2 思考中状态

```
  ┌─ thinkingRow ─────────────────────────────┐
  │  思考中...  ● ● ●  (脉冲动画)             │
  └────────────────────────────────────────────┘
```

### 5.3 工具运行中状态

- Spinner: `border 1.5px solid`, `800ms linear infinite`
- 进度条: `height:4px`, `border-radius:2px`, `transition: width 300ms ease`
- 状态色: 运行中绿，错误红，确认黄

---

## 6. 虚拟滚动

| 属性 | 值 |
|------|-----|
| 库 | `@tanstack/react-virtual` |
| 估算行高 | `160px` (`ESTIMATED_ROW_HEIGHT`) |
| 消息间距 | `22px` (`MESSAGE_GAP`) |
| 过扫描 | `4` 条 |
| 测量方式 | `virtualizer.measureElement` (动态高度) |

---

## 7. Composer (输入区)

```
┌─ bottomComposerWrap (position:absolute, bottom:0, z-index:5) ──┐
│  ┌─ bottomComposer (border-radius:20px) ──────────────────────┐│
│  │  ┌─ 附件预览行 (flex, gap:8, overflow-x:auto) ──────────┐ ││
│  │  │  [card 80×80] [card] [card] ...                       │ ││
│  │  └──────────────────────────────────────────────────────┘ ││
│  │                                                           ││
│  │  ┌─ bottomComposerInputWrap (padding-left:6px) ─────────┐ ││
│  │  │  textarea (min-height:20px, max-height:220px)        │ ││
│  │  │  font-size:14px, line-height:1.4                      │ ││
│  │  └──────────────────────────────────────────────────────┘ ││
│  │                                                           ││
│  │  ┌─ bottomComposerFooter (flex, space-between) ────────┐ ││
│  │  │  Left: [📎] [项目标签] [模式标签]                    │ ││
│  │  │  Right: [字数] [发送]                                 │ ││
│  │  └──────────────────────────────────────────────────────┘ ││
│  └───────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─ scrollToBottomBtn (position:absolute, top:-10px) ──────┐│
│  │  [↓] 36×36, border-radius:999, backdrop-filter:blur(14)  ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─ bottomComposerGlow ─────────────────────────────────────┐│
│  │  linear-gradient(icon-c 8% → transparent 72%)            ││
│  │  filter:blur(18px), opacity:0.72                         ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 设计要点

| 属性 | 值 | 说明 |
|------|-----|------|
| 圆角 | `20px` | 大圆角，对话感 |
| 边框 | `1px solid transparent` + `box-shadow` | 浮起感 |
| 阴影 | `0 0.25rem 1.25rem rgba(0,0,0,0.04)` | 轻阴影 |
| 底部光晕 | `150% width, blur(18px), opacity 0.72` | 发送按钮聚焦光效 |
| 滚动按钮 | `36×36px, border-radius:999px` | 悬浮圆按钮 |
| 附件卡片 | `80×80px`, 入场 `260ms cubic-bezier(0.22, 0.88, 0.28, 1)` | 缩放+位移 |
| 模型标签 | `pill` 样式, `border-radius:8px`, `0 6px padding` | 蓝色主题 |

---

## 8. 入场动画

| 元素 | 动画 | 时长 | 缓动 |
|------|------|------|------|
| 页面 | `pageEnter` (opacity 0→1) | 300ms | ease |
| Header | `headerEnter` (opacity 0→1, translateY -12→0) | 400ms, delay 50ms | ease |
| 内容区 | `contentEnter` (opacity 0→1) | 400ms, delay 100ms | ease |
| Composer | `composerEnter` (opacity 0→1, translateY 20→0) | 450ms, delay 150ms | cubic-bezier(0.34, 1.2, 0.64, 1) |
| 附件卡片 | `userAttachmentEnter` (opacity 0→1, translateY 16→0, scale 0.92→1) | 260ms | cubic-bezier(0.22, 0.88, 0.28, 1) |
| 工具块 | `fadeUp` (opacity 0→1, translateY 6→0) | 300ms | ease |
| 模型标签 | `chipEnter` (opacity 0→1, translateX -8→0) | 200ms | ease |

---

## 9. 间距与尺寸体系

| 级别 | 值 | 用途 |
|------|-----|------|
| xs | `4px` | 图标间距、小 badge padding |
| sm | `6px` | 小按钮内边距、图标标签间距 |
| md | `8px` | 标准内边距、flex gap、附件间距 |
| lg | `12px` | 卡片内边距、section gap |
| xl | `16px` | 用户气泡 padding、代码块 padding |
| 2xl | `22px` | 消息间距 (`MESSAGE_GAP`) |
| 3xl | `24px` | 内容区顶部 padding |

---

## 10. 圆角体系

| 元素 | 圆角 |
|------|------|
| 用户气泡 | `16px` |
| Composer | `20px` |
| 代码块 | `12px` |
| 工具块 | `8px` |
| 小按钮/标签 | `6-10px` |
| 滚动按钮 | `999px` (圆形) |
| 下拉菜单 | `8-10px` |

---

## 11. 颜色体系 (CSS 变量)

| 类别 | 变量 | 说明 |
|------|------|------|
| 文字主色 | `--txt1` | 正文、标题 |
| 文字次色 | `--txt2` | 次要文字、模型名 |
| 文字弱色 | `--txt3` | 时间戳、辅助信息 |
| 背景主色 | `--main-bg` | 页面背景 |
| 表面色 | `--surface` | Composer 背景 |
| 表面软色 | `--surface-soft` | 用户气泡、代码块 |
| 悬停色 | `--hover` | 按钮 hover 背景 |
| 边框色 | `--border` | 分割线、边框 |
| 主题色 | `--main-blue` | 链接、标签 |
| 强调色 | `--accent` | 流式光标、代码高亮 |
| 错误色 | `--err` / `#ef4444` | 错误信息 |
| 成功色 | `#22a552` / `#6cbf7b` | 工具完成状态 |

---

## 12. 与 ravens Web UI 的对照

| 方面 | ravens Web UI | board 现状 | 改进方向 |
|------|-----------------|------------|----------|
| 用户消息对齐 | `align-items: flex-end`, `max-width: min(82%, 64ch)` | `align-items: flex-end`, `max-width: min(85%, 75ch)` | 已一致 |
| 助手消息对齐 | `width: 100%`, `gap: 12px` | `width: 100%`, `gap: 4px` | 增大到 12px |
| Part 分组 | `ContextToolGroup` 折叠连续 context 工具 | 无分组，逐个显示 | 需实现分组折叠 |
| 流式文本节奏 | `PacedMarkdown` 24ms/步打字机 | `charAnimated` 单字符渐入 | 可选引入节奏控制 |
| 折叠展开动画 | spring 动画 `visualDuration: 0.35` | `grid-template-rows` 250ms | 基本一致 |
| 虚拟化 | 无，`content-visibility: auto` | `@tanstack/react-virtual` | board 方案更优 |
| 自动滚动 | `ResizeObserver` + 用户滚动检测 | 自行实现滚动管理 | 需优化 |
| Composer Dock | `DockSurface` 组件 | 绝对定位 | 可参考 dock 模式 |
| 消息元数据 hover | `opacity:0 → 1, 150ms ease` | `opacity:0 → 1, 140ms ease` | 已一致 |