# Chats Page — SPEC

## 1. Concept & Vision

Chats 是用户会话历史的管理页面。简洁、务实，像一个高效的个人消息归档工具。整体感觉：安静、有序、不打扰。列表驱动，用户快速扫读、定位、继续对话。

## 2. Design Language

### Aesthetic Direction
与侧边栏一致的视觉语言。无装饰、功能驱动。信息密度适中。

### Color Palette
继承 global.css theme tokens：
- `--sidebar-bg` — 页面背景
- `--surface` — 卡片/列表项背景
- `--surface-soft` — 搜索框背景
- `--txt1/txt2/txt3` — 标题/预览/时间文字
- `--icon-c` — 图标
- `--border` — 分割线
- `--hover` — 悬停态

### Typography
- 标题：14px, 500
- 预览：13px, 400, `--txt2`
- 时间：12px, 400, `--txt3`

### Motion
- 列表项进入：fade + translateY(8px) → natural, 200ms ease-out
- 悬停：背景色 transition 120ms
- 搜索框 focus：border-color transition 150ms
- 置顶/删除操作后列表重排：layout shift 200ms

### Spatial System
- 页面 padding: 24px 20px
- 列表项 padding: 12px 14px
- 列表项 gap: 4px
- 圆角: 8px (列表项)

## 3. Layout & Structure

```
┌─────────────────────────────────────────────────┐
│  [Search Bar]                    [+ New Chat]   │
│                                                  │
│  [Chat Item 1]  ─ pinned                         │
│  [Chat Item 2]                                    │
│  [Chat Item 3]  ─ last active                   │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

- 固定头部：搜索框 + 新建按钮并排
- 纯垂直列表，无分组
- 置顶项在最前，以下按 `lastActiveAt` 倒序
- 响应式：移动端搜索框单行，新建按钮 icon-only

## 4. Features & Interactions

### Search
- Placeholder: "Search chats..." / "搜索会话..."
- 实时过滤（debounce 150ms），匹配标题和预览文字
- 无结果时显示空状态插图 + 文案

### New Chat
- 点击直接创建空白会话（后续跳转 Chat Detail 页面，本次只做列表）
- 快捷键: `⇧⌘N`

### Chat Item
- **信息**：标题（截断20字符）+ 预览（截断60字符）+ 相对时间（"2h ago" / "2小时前"）
- **悬停**：显示操作按钮区（置顶/归档/删除）
- **点击**：选中态（左侧竖条 indicator），跳转 Chat Detail
- **置顶**：左侧 pin 图标，点击取消置顶
- **归档**：soft-delete，会话从列表移除
- **删除**：hard-delete，二次确认 tooltip

### Empty State
- 无会话时：插图 + "No chats yet" / "暂无会话"
- 搜索无结果：插图 + "No results" / "无匹配结果"

### Data Model
```ts
interface Chat {
  id: string;
  title: string;
  preview: string;        // 首条用户消息或 "New chat"
  lastActiveAt: number;  // timestamp
  isPinned: boolean;
  isArchived: boolean;
  createdAt: number;
}
```

## 5. Component Inventory

### `<ChatsPage>`
- 根页面组件
- 管理 search query state
- 持有 chats 列表（从 store 或本地 state）
- 包含 `<SearchBar>` + `<ChatItem>` 列表

### `<SearchBar>`
- Props: `value`, `onChange`, `placeholder`
- States: default, focused (ring), filled
- 左侧 search icon，右侧 clear button（当有内容时）

### `<ChatItem>`
- Props: `chat`, `isActive`, `onClick`, `onPin`, `onArchive`, `onDelete`
- States: default, hover (show actions), active (selected), pinned
- 悬停显示 action buttons: Pin / Archive / Trash
- 标题+预览+时间三行布局

### `<EmptyState>`
- Props: `type: 'no-chats' | 'no-results'`, `locale`
- 居中插图 + 文案

## 6. Technical Approach

- **路由**: React Router (`/chats`)
- **状态**: 本地 useState + useEffect（chats 数据），store 只管 UI state
- **持久化**: 后续接 API；本次用 localStorage mock 数据
- **i18n**: 新增 `chats` key 到 en.js / zh.js
- **Icons**: `@phosphor-icons/react` — `IconMagnifyingGlass`, `IconPlus`, `IconPin`, `IconArchive`, `IconTrash`, `IconChat`

## 7. Mock Data

```js
const mockChats = [
  { id: '1', title: 'RAG 检索优化', preview: '能否详细解释一下向量检索的原理...', lastActiveAt: Date.now() - 1000 * 60 * 30, isPinned: true, isArchived: false, createdAt: Date.now() - 86400000 },
  { id: '2', title: 'Next.js 15 migration', preview: '升级到 Next.js 15 遇到模块问题...', lastActiveAt: Date.now() - 1000 * 60 * 60 * 2, isPinned: false, isArchived: false, createdAt: Date.now() - 86400000 * 3 },
  { id: '3', title: 'API design review', preview: '帮我 review 一下这个 RESTful 接口设计...', lastActiveAt: Date.now() - 1000 * 60 * 60 * 24, isPinned: false, isArchived: false, createdAt: Date.now() - 86400000 * 5 },
  { id: '4', title: 'CSS animation help', preview: '想实现一个弹性效果的按钮动画...', lastActiveAt: Date.now() - 1000 * 60 * 60 * 24 * 3, isPinned: false, isArchived: false, createdAt: Date.now() - 86400000 * 7 },
  { id: '5', title: 'Archived project chat', preview: '这是一个归档的会话示例...', lastActiveAt: Date.now() - 86400000 * 10, isPinned: false, isArchived: true, createdAt: Date.now() - 86400000 * 14 },
];
```
