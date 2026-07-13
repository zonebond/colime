# 附件上传后端设计(v3.1 — 会话目录直存)

**状态**: 已定稿方向
**取代**: v2(独立存储区+物化)与 minimal attachment service(MinIO)—— 两者的存储层均被本方案取代
**决策**: 附件直接存入会话目录,不引入 MinIO、不做独立存储区、不做物化复制

---

## 1. 核心决策与理由

每个会话本来就对应一个工作目录,附件的最终归宿就是让 Agent 能读到 —— 那么**上传时直接写入会话目录**即可:

| 维度 | v2(独立存储+物化) | v3(会话目录直存) |
|---|---|---|
| Agent 可读 | 引用时复制(materialize) | **上传即就位** |
| 预览/下载 | 新增 /attachment/:id/download | **现有 /file 端点原样可用** |
| 生命周期 | 需要 GC | **删会话即回收** |
| 元数据 | SQLite 表 | **文件系统即事实**(P1 免表) |
| 新增基础设施 | MinIO(P3) | **无** |
| 失去的能力 | — | 跨实例扩展、sha256 去重(当前单机部署无此需求) |

## 2. 存储布局

```
{sessionDir}/attachments/{filename}          # 会话附件
{dataRoot}/storage/groups/{labelId}/         # 项目组(group)附件 —— 归属 group 自身,与任何 chat 无关
{sessionDir}/group-files -> 上述 group 目录   # 由每次 prompt 时的"成员对账"维护(见 2.1)
```

- 同名冲突: 追加序号后缀(report.pdf → report-2.pdf)
- Agent 约定不修改 group-files 下内容(系统提示注入)

### 2.1 group 成员关系是动态的 —— 每次 prompt 时对账

group 只是逻辑分组(labelId),chat 可随时加入/移出。因此 group 资源的可见性**不在会话创建时固化**,而是每次 prompt 开始时做一次幂等对账:

1. 读取会话**当前** labelId
2. 有 group 且 group 目录非空 → 确保 `{sessionDir}/group-files` symlink 指向当前 group 目录
3. 已移出 group → 删除 symlink;换组 → 重指向
4. file 端点访问 group 文件时按"该会话此刻的 labelId"做访问校验

语义: 成员关系变化在下一次对话立即生效;历史消息中已内联的内容不追溯(发送当时是合法访问)。

> 实现检查点: ravens 文件工具带路径穿越防护,需确认对"会话目录内指向 group 目录的 symlink"放行;若不放行,改为将 group 目录加入该会话的工具路径白名单(语义等价,二选一)。

## 3. API(仅新增两个上传端点)

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/session/:id/attachment` | multipart,写入 {sessionDir}/attachments/,返回 {name,path,size,mime} |
| POST | `/label/:id/attachment` | multipart,写入 group 目录 |
| GET | `/label/:id/attachment` | 项目页文件列表(项目页无会话上下文,不走 /file) |

会话内的列表/下载/预览/删除复用现有 `/file` 端点(带 sessionID 与 Range 支持)。

## 4. 消息引用与模型消费(与存储无关,仍必须做)

board 的 file part 改为携带会话内相对路径:

```json
{ "type": "file", "path": "attachments/报告.pdf", "filename": "报告.pdf", "mime": "application/pdf", "size": 102400 }
```

ravens 收到 prompt 后按 mime 改写 part:

| 类型 | 处理 |
|---|---|
| 图片 / PDF ≤ 8MB | 从会话目录读取 → data: URL 内联进 file part(多模态直读) |
| 图片 / PDF > 8MB | 降级为文本提示(路径+大小),Agent 用工具处理 |
| 文本类 ≤ 32KB | 内联为 text part(附路径说明) |
| 文本类 > 32KB / 其他二进制 | 仅注入路径提示,Agent 用 Read/Bash 按需读取 |

大文件不进 prompt,与自动压缩机制天然协作。

## 5. 前端改造

1. `uploadChatAttachment` → XHR multipart 到 `POST /session/:id/attachment`(进度 UI 已存在,直接接线)
2. `toPromptPayload` file part → 相对路径,弃用 blob: URL
3. ProjectDetailPage 上传 → `POST /label/:id/attachment`;文件列表/删除复用 /file
4. **new chat 无会话时的上传 —— 延迟上传**: `/chats/new` 尚无会话 ID 与工作目录,此时选择的附件停留在本地草稿态(现有 draft/进度 UI 复用),发送流水线变为: **创建会话 → 逐个上传(展示进度) → 发送消息**。任一附件上传失败则标红可重试并阻止发送,不做静默丢弃。已有会话维持"选中即上传"。
   - 否决的替代: 选附件即建会话(产生无对话的幽灵会话)、服务端临时暂存区(多一套搬运机制)
5. 上传中禁止发送该附件

## 6. 分期

| 期 | 内容 |
|---|---|
| **P1** | POST /session/:id/attachment + 发送时 part 改写 + 前端接线(含 new chat 延迟上传流水线) → chat 附件端到端可用 |
| **P2** | group 目录 + 每 prompt 成员对账(symlink/白名单) + 项目页上传/列表 |
| **P3**(如有需要) | 配额/类型限制、去重、若未来多实例部署再评估对象存储 |
