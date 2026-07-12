# 附件上传后端设计（v2 — 补全消费链路）

**状态**: 提案
**前置文档**: `minimal attachment resource service.md`（存储与引用层,本文档兼容其数据模型并补全消费链路）
**覆盖场景**: ① chat 会话 composer 上传 ② 项目详情页上传及项目内会话 composer 上传

---

## 1. 现状问题（为什么必须重做后端）

当前 `uploadChatAttachment` 是前端桩实现:

```js
// board: 生成浏览器本地 blob: URL,后端不可读
url: URL.createObjectURL(fileBlob)
```

ravens 侧 `toModelMessages` 把 file part 的 `url` **原样传给 AI SDK**:

```ts
userMessage.parts.push({ type: "file", url: part.url, mediaType: part.mime, ... })
```

`blob:` URL 只存在于用户浏览器标签页的内存里,服务端无法解引用 → **附件从未真正到达模型**。项目详情页上传同理,文件只存在于前端状态。

## 2. 设计原则

1. **消费优先**:先定义"文件如何被模型/Agent 使用",再倒推存储。ravens 是文件系统中心的 Agent（Read/Grep/Bash 都作用于会话目录）,附件的最高价值形态是**会话工作区里的真实文件**。
2. **两种消费模式**,缺一不可:
   - **模型直读**（多模态): 图片/PDF 作为 file part 进入 prompt → URL 必须是 ravens 进程可解析的（data: 内联或服务端可取回）
   - **Agent 工具读**（大文件/代码/表格): 文件落入会话目录 → Agent 用现有工具自然读取,不占 prompt 窗口
3. **存储后端可替换**: 定义 `AttachmentStore` 接口;默认文件系统实现（零新增基础设施,ravens 数据目录已有 `storage/`）,MinIO 作为可选驱动（保留既有决策,但不作为 P1 依赖）。
4. **对齐 ravens 真实模型**: board 的"项目" = ravens 的 `labelId`。API 按 session/label 设计,不引入不存在的 project 实体。

## 3. 数据模型（SQLite, ravens-local.db）

```ts
// attachment 表
{
  id: string            // att_*
  ownerType: 'session' | 'label'
  ownerId: string       // sessionID 或 labelId
  name: string
  mime: string
  size: number
  sha256: string        // 去重与幂等物化依据
  storage: 'fs' | 'minio'
  objectKey: string     // fs: 相对 storage 根;minio: bucket 内 key
  status: 'ready' | 'failed'
  time: { created: number }
}
```

对象存放规则（fs 驱动,位于 `~/.local/share/ravens/storage/attachments/`）:

```
session/{sessionID}/{attachmentId}-{filename}
label/{labelId}/{attachmentId}-{filename}
```

## 4. API（ravens HttpApi 新增 attachment 组）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/session/:id/attachment` | multipart 上传,归属该会话 |
| POST | `/label/:id/attachment` | multipart 上传,归属该项目（label） |
| GET | `/session/:id/attachment` | 列出会话可见附件 = 自有 + 所属 label 的 |
| GET | `/label/:id/attachment` | 列出项目附件 |
| GET | `/attachment/:id/download` | 流式下载,支持 Range（预览复用） |
| DELETE | `/attachment/:id` | 删除记录 + 对象 |

可见性规则（沿用既有文档）: 会话可引用**自有附件 + 父 label 附件**,不可跨会话/跨项目。

## 5. 消息引用与消费链路（本设计的核心增量）

### 5.1 发送消息

board 的 file part 不再携带 blob URL,改为:

```json
{ "type": "file", "attachmentId": "att_x", "filename": "报告.pdf", "mime": "application/pdf", "size": 102400 }
```

### 5.2 ravens 收到 prompt 后的物化（materialize）

对消息里每个 attachmentId:

1. **校验可见性**（会话自有或父 label）
2. **物化到会话工作区**: 复制到 `{sessionDir}/attachments/{filename}`（按 sha256 幂等,重复引用不重复复制;label 附件在首次被某会话引用时懒物化到该会话）
3. **按 mime 改写 part 供模型消费**:

| 类型 | 处理 |
|---|---|
| 图片 / PDF（≤ 8MB） | 读取内容 → `data:` URL 内联进 file part（AI SDK 直接可用,不依赖网络回环） |
| 图片 / PDF（> 8MB） | file part 的 url 指向 `/attachment/:id/download`（要求模型 provider 可回源时才用,否则降级为下述文本引用） |
| 文本类（代码/csv/md/txt） | 转为 text part:「附件已存放于 attachments/{filename}」+ 小文件（≤ 32KB）直接内联内容;大文件仅给路径,Agent 用 Read 工具按需读取 |
| 其他二进制 | 仅给路径提示,Agent 用 Bash/工具处理 |

这样**大文件不再撑爆上下文**,并且与自动压缩机制天然协作。

### 5.3 项目附件在会话中的呈现

- 会话创建时不复制（避免项目大文件复制风暴）
- 系统提示或首条消息注入项目附件清单（名称+大小),Agent 需要时通过引用触发懒物化,或直接提示用户 @ 引用

## 6. 前端改造清单

1. `uploadChatAttachment` → 真实 multipart 上传（XHR 以获得进度事件,composer 的进度 UI 已经存在,直接接上）
2. `toPromptPayload` → file part 改用 `attachmentId`
3. ProjectDetailPage 上传 → `POST /label/:id/attachment`;项目文件列表接 `GET /label/:id/attachment`;删除接 DELETE
4. 预览弹窗对附件的下载/预览统一走 `/attachment/:id/download`（支持 Range,现有 preview 逻辑可复用）
5. 上传约束: 单文件 ≤ 50MB（可配),类型黑名单可后置

## 7. 分期

| 期 | 内容 | 效果 |
|---|---|---|
| **P1** | fs 存储 + session 上传/下载 + 发送物化 + 模型内联 | chat 附件端到端真正可用 |
| **P2** | label 范围上传/列表/可见性 + 懒物化 | 项目附件与项目内会话共享 |
| **P3** | MinIO 驱动 + 预签名 URL、sha256 去重、孤儿对象 GC、配额 | 规模化 |

## 8. 与既有 MinIO 决策的关系

`AttachmentStore` 接口先行,fs 为默认驱动的理由: 零新容器/零运维即可让功能端到端跑通;MinIO 驱动在 P3 无缝替换（objectKey 规则与既有文档一致）。若团队坚持 P1 即用 MinIO,仅替换 store 实现,API 与消费链路不变。
