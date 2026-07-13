# 附件上传后端设计(v3 — 会话目录直存)

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
{dataRoot}/storage/labels/{labelId}/         # 项目(label)附件
{sessionDir}/project-files -> 上述 label 目录  # 项目内会话通过 symlink 访问(约定只读)
```

- 同名冲突: 追加序号后缀(report.pdf → report-2.pdf)
- 项目附件访问采用 symlink(零复制);Agent 约定不修改 project-files 下内容(系统提示注入)

## 3. API(仅新增两个上传端点)

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/session/:id/attachment` | multipart,写入 {sessionDir}/attachments/,返回 {name,path,size,mime} |
| POST | `/label/:id/attachment` | multipart,写入 label 目录 |

列表/下载/预览/删除全部复用现有 `/file` 端点(带 sessionID 与 Range 支持)。项目文件列表用 /file 于 label 目录(或轻量新增 GET /label/:id/attachment)。

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
4. 边界: 新会话先创建再上传(现有流程已如此);上传中禁止发送该附件

## 6. 分期

| 期 | 内容 |
|---|---|
| **P1** | POST /session/:id/attachment + 发送时 part 改写 + 前端接线 → chat 附件端到端可用 |
| **P2** | label 目录 + symlink + 项目页上传/列表 |
| **P3**(如有需要) | 配额/类型限制、去重、若未来多实例部署再评估对象存储 |
