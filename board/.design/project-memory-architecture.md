# Ravens Core Project Memory Architecture

## Goal

Design a lightweight, durable RAG layer for `ravens.core` so agents can remember project-specific code patterns, architectural decisions, and prior conclusions across sessions without adding heavy infrastructure.

## Recommended Direction

**Primary recommendation:** keep everything inside `ravens.core` using **Node.js + SQLite**, with:

- `memory_entries` as the **logical source of truth** for user-visible/project-level memories
- a new chunk/index layer for retrieval
- **FTS5** for keyword search
- **`sqlite-vec`** for vector similarity **if available**
- a **file-based vector fallback** if `sqlite-vec` cannot be loaded in the target environment

This keeps deployment simple: one service, one database, optional extension, no Docker, no separate vector DB.

---

## 1. Architecture Overview

```text
Sources
  - manual saved memory
  - session summaries
  - project instructions
  - selected code/docs/resource extracts

        ↓ normalize

memory_entries
  - canonical memory record

        ↓ chunk

memory_chunks
  - retrieval units

        ↓ index

FTS5 index                 Vector index
memory_chunks_fts          sqlite-vec OR file-based vectors

        ↓ hybrid retrieval

rank + dedupe + token budget trim

        ↓

buildRuntimeContract()
  - inject retrieved project memories
  - send structured memory blocks to runtime
```

---

## 2. Data Model

## 2.1 Keep `memory_entries` as the parent record

Do **not** replace `memory_entries` immediately. Treat it as the durable business entity and add retrieval-specific tables around it.

Why:

- preserves existing product semantics
- easier migration path
- lets `ravens.core` distinguish between a memory item and its searchable chunks
- supports re-indexing without rewriting business records

Suggested role of `memory_entries`:

- one row per saved memory / decision / summary / extracted note
- owns lifecycle, project scope, author, timestamps, source metadata
- stores the canonical text blob before chunking

Suggested shape:

```sql
CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_type TEXT NOT NULL,          -- manual, session_summary, file_extract, decision, architecture
  source_ref_id TEXT,                 -- chat/message/file/attachment/run id if applicable
  title TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  tags_json TEXT,                     -- JSON array
  importance REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_memory_entries_project
  ON memory_entries(project_id, status, updated_at);
```

## 2.2 Add `memory_chunks`

Each `memory_entry` is split into retrieval-sized blocks.

```sql
CREATE TABLE IF NOT EXISTS memory_chunks (
  id TEXT PRIMARY KEY,
  memory_entry_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  char_count INTEGER,
  heading_path TEXT,
  source_uri TEXT,
  tags_json TEXT,
  importance REAL NOT NULL DEFAULT 0.5,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (memory_entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_chunks_order
  ON memory_chunks(memory_entry_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_memory_chunks_project
  ON memory_chunks(project_id, updated_at);
```

## 2.3 Add FTS5 for keyword retrieval

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
  chunk_id UNINDEXED,
  project_id UNINDEXED,
  content,
  title,
  tags,
  tokenize = 'porter unicode61'
);
```

On chunk upsert, mirror data into `memory_chunks_fts`.

## 2.4 Vector storage: preferred `sqlite-vec`

If `sqlite-vec` can be loaded in production/local environments, keep vectors near the rest of the data.

Example schema:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(
  chunk_id TEXT PRIMARY KEY,
  project_id TEXT,
  embedding float[1024]
);
```

Also store embedding metadata in a regular table so model changes are traceable:

```sql
CREATE TABLE IF NOT EXISTS memory_vector_meta (
  chunk_id TEXT PRIMARY KEY,
  embedding_model TEXT NOT NULL,
  embedding_dim INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  indexed_at INTEGER NOT NULL,
  FOREIGN KEY (chunk_id) REFERENCES memory_chunks(id) ON DELETE CASCADE
);
```

## 2.5 Fallback: file-based vector store

If `sqlite-vec` is not available, keep vectors in a per-project file under a core-managed data directory.

Example:

```text
data/project-memory/
  <projectId>/
    manifest.json
    vectors.jsonl
```

`vectors.jsonl` record example:

```json
{"chunkId":"memc_001","projectId":"proj_123","model":"text-embedding-3-small","dim":1024,"contentHash":"sha256:...","embedding":[0.0123,-0.182,...]}
```

Rules:

- SQLite remains source of truth for entries/chunks/FTS
- file store is only the vector index
- load only candidate vectors for one project at retrieval time
- acceptable because project memory size should remain moderate

---

## 3. Indexing Pipeline

## 3.1 Ingestion sources

Project memory should be built from explicit, high-signal sources first:

1. manually saved memory from user/agent
2. session summaries promoted to project memory
3. architectural notes/design docs
4. extracted conclusions from important chats/runs
5. curated file/resource excerpts

Avoid indexing every raw message by default. That creates noise and retrieval drift.

## 3.2 Normalization

Before chunking, normalize into a canonical `memory_entry`:

- clean markdown/plain text
- remove duplicated whitespace
- attach `source_type`, `source_ref_id`, tags, title
- compute `content_hash`
- skip re-embedding if hash unchanged

## 3.3 Chunking strategy

Recommended defaults:

- chunk target: **400-800 tokens**
- overlap: **60-100 tokens**
- keep headings with body when possible
- never split code fence metadata from its body
- store `heading_path` for prompt display

Chunking rules by source:

- **decision/summary memory**: usually 1 chunk
- **design docs**: split by section heading, then token limit
- **code/resource extract**: preserve file path + symbol context in chunk header

## 3.4 Re-index triggers

Re-index when:

- `memory_entries.content` changes
- tags or title materially change
- embedding model changes
- chunking version changes

Add lightweight versioning in code/config:

- `chunking_version`
- `embedding_model`
- `embedding_dim`

---

## 4. Embedding Strategy

## 4.1 Default recommendation

Use a **pluggable embedding provider** behind `ravens.core`:

- default: external embedding API
- optional fallback: local model for offline/dev mode

Why:

- Node.js service stays simple
- no heavy local inference requirement for all deployments
- can switch providers without changing retrieval schema

## 4.2 Provider contract

`ravens.core` should define one embedding interface:

```ts
embedTexts(texts: string[], options?: {
  model?: string
  inputType?: 'query' | 'document'
}): Promise<Array<{ embedding: number[] }>>
```

Implementation choices:

### Option A — external API (recommended first)

- good for fastest rollout
- stable dimensions
- minimal ops burden

Good fit:

- OpenAI-compatible embedding endpoint
- any provider already used elsewhere in Ravens

Recommended baseline:

- a small/medium embedding model with **~768-1536 dims**
- store exact model name in `memory_vector_meta`

### Option B — local model (optional)

For offline/private installs, support a local embedding path later via:

- `transformers.js`
- a small sentence-transformer/BGE-style model
- or an internal local HTTP endpoint if one already exists

This should be optional, not required for first implementation.

## 4.3 Document vs query embeddings

If the provider supports different modes, use:

- **document embedding** when indexing chunks
- **query embedding** when embedding the current request

If not supported, reuse the same model for both.

## 4.4 Cost and caching

To keep indexing cheap:

- cache by `content_hash + embedding_model`
- only embed changed chunks
- batch requests per project
- index asynchronously after memory save when possible

---

## 5. Retrieval Design

## 5.1 Query inputs

For each agent turn, build a retrieval query from:

- latest user message
- active project title/instructions
- optionally the last assistant plan/goal summary

Do **not** embed the full chat transcript every turn.

## 5.2 Candidate generation

Use **hybrid retrieval** with three sources:

1. **vector similarity** against `memory_vectors`
2. **keyword search** against `memory_chunks_fts`
3. **business boosts** from metadata

Business boosts include:

- same project only
- active status only
- higher `importance`
- recent updates slightly boosted
- architecture/decision memories boosted over generic notes

## 5.3 Example keyword query

```sql
SELECT
  mc.id,
  mc.memory_entry_id,
  mc.content,
  mc.heading_path,
  mc.importance,
  bm25(memory_chunks_fts) AS keyword_score
FROM memory_chunks_fts fts
JOIN memory_chunks mc ON mc.id = fts.chunk_id
WHERE fts.project_id = ?
  AND memory_chunks_fts MATCH ?
ORDER BY keyword_score
LIMIT 20;
```

## 5.4 Example vector query

With `sqlite-vec`, perform top-k nearest-neighbor lookup for the current project.

Illustrative pattern:

```sql
-- Pseudocode shape; exact syntax depends on sqlite-vec version.
SELECT
  mc.id,
  mc.memory_entry_id,
  mc.content,
  mc.heading_path,
  distance
FROM memory_vectors mv
JOIN memory_chunks mc ON mc.id = mv.chunk_id
WHERE mv.project_id = ?
  AND mv.embedding MATCH ?
ORDER BY distance ASC
LIMIT 20;
```

If using the file fallback:

- fetch top keyword candidates from SQLite first
- optionally add a recent/high-importance candidate pool
- compute cosine similarity in Node.js against vectors loaded from `vectors.jsonl`
- take top-k results

## 5.5 Rank fusion

Combine keyword and vector candidates with a simple weighted score.

Suggested initial formula:

```text
final_score =
  0.45 * normalized_vector_score
  + 0.35 * normalized_keyword_score
  + 0.10 * importance_score
  + 0.05 * recency_score
  + 0.05 * source_type_score
```

Notes:

- vector score should dominate semantic matching
- keyword score protects exact symbol/path/term hits
- metadata breaks ties in business-useful ways

## 5.6 Deduping and expansion

After scoring:

1. dedupe by `memory_entry_id`
2. keep best chunk first
3. optionally attach one adjacent chunk when continuity is needed
4. stop at a strict token budget

Recommended per-turn retrieval budget:

- target: **3-8 chunks**
- hard cap: **1,200-2,000 tokens** total injected memory

## 5.7 Fallback behavior

If vector retrieval is unavailable:

- use FTS5 only
- boost exact title/tag/path matches
- still inject top decision/architecture memories by importance

This guarantees useful retrieval even without embeddings.

---

## 6. Prompt Injection via `buildRuntimeContract`

## 6.1 Contract addition

Extend `buildRuntimeContract()` so the runtime receives a dedicated project-memory field.

Recommended shape:

```json
{
  "projectMemory": {
    "enabled": true,
    "query": "user intent summary used for retrieval",
    "results": [
      {
        "memoryEntryId": "mem_123",
        "chunkId": "memc_456",
        "title": "Core service boundary",
        "sourceType": "architecture",
        "headingPath": "Service Boundaries > ravens.core",
        "score": 0.92,
        "content": "ravens.core owns context composition, session persistence...",
        "sourceRefId": "doc_789",
        "tags": ["architecture", "core"]
      }
    ]
  }
}
```

This is better than flattening into one raw string because:

- runtime/providers can render it differently later
- scores/source metadata remain available
- easier debugging and observability

## 6.2 Prompt formatting

Before sending to the model, format retrieved memory blocks into a clearly bounded section.

Recommended prompt fragment:

```text
## Project Memory
Use these project-specific memories as high-priority background context.
Prefer them when they are relevant, but do not treat them as absolute truth if the current repo/runtime state contradicts them.

[Memory 1 | architecture | score=0.92]
Title: Core service boundary
Path: Service Boundaries > ravens.core
Tags: architecture, core
Content:
ravens.core owns context composition, session persistence, and product orchestration.

[Memory 2 | decision | score=0.88]
Title: Project resources are shared across chats
Content:
Project-scoped resources are visible to chats under the same project and should be exposed through runtime contract fields.
```

Formatting rules:

- clear heading: `Project Memory`
- one block per retrieved chunk
- include title/source type/tags
- include score only for debugging or internal traces; omit from model prompt if noisy
- preserve exact wording for decisions/constraints

## 6.3 Injection order inside the runtime contract

Recommended prompt assembly order:

1. system instructions
2. project instructions
3. **project memory**
4. relevant resources/attachments summary
5. current conversation slice
6. tool/runtime contract details

Reasoning:

- memory should influence interpretation early
- but project instructions remain the top durable rule layer
- current user intent still comes later and anchors the actual task

## 6.4 Safety guidance in prompt

Add a brief instruction near the memory block:

- memory may be stale
- prefer current repo/files over memory when they conflict
- use memory as guidance, not unquestioned fact

This reduces hallucinated reliance on outdated summaries.

---

## 7. How This Fits the Existing `memory_entries` Table

## Recommended migration strategy: extend, do not replace

### Phase 1

Keep `memory_entries` and add:

- `memory_chunks`
- `memory_chunks_fts`
- `memory_vectors` / file vector store
- `memory_vector_meta`

This is the best first implementation.

### Phase 2

Optionally enrich `memory_entries` with:

- `source_type`
- `importance`
- `summary`
- `tags_json`
- `content_hash`

### Phase 3

Only consider replacement if the existing table is too limited or badly shaped. Even then, preserve the concept:

- `memory_entries` = business entity
- `memory_chunks` = retrieval entity

That separation is still valuable.

## Why not store vectors directly in `memory_entries`?

- one entry can map to multiple chunks
- re-chunking becomes painful
- retrieval wants chunk granularity
- keyword and vector indexing have different lifecycle needs

---

## 8. Implementation Notes for `ravens.core`

## 8.1 Lightweight service layout

Suggested internal modules later in `ravens.core`:

```text
src/project-memory/
  memory.repository.js
  memory.chunker.js
  memory.embedder.js
  memory.indexer.js
  memory.retriever.js
  memory.prompt.js
```

## 8.2 Runtime path

At request time:

1. `ravens.core` resolves active `projectId`
2. builds retrieval query from current turn
3. fetches top memory chunks
4. trims to token budget
5. injects `projectMemory` into `buildRuntimeContract()`
6. forwards contract to `ravens.runtime`

## 8.3 Write path

When memory is saved/promoted:

1. insert/update `memory_entries`
2. chunk content
3. upsert `memory_chunks`
4. update FTS rows
5. generate embeddings asynchronously or inline for small writes
6. upsert vector index

Prefer async indexing when possible so chat latency stays low.

---

## 9. Operational Guidance

## 9.1 Good defaults

- enable project memory only for chats attached to a project
- cap total memory count per project initially if needed
- archive low-value memories instead of deleting immediately
- log retrieval hits for tuning

## 9.2 Observability

Store retrieval trace data for debugging:

- retrieval query text
- candidate ids
- rank scores by component
- final injected chunks
- embedding model used

This is especially helpful when tuning hybrid search quality.

## 9.3 Failure modes

If embeddings fail:

- keep memory entry/chunks
- mark vector state as pending/failed
- continue using FTS retrieval

If `sqlite-vec` fails to load:

- log once at startup
- switch to file-based vector mode or FTS-only mode
- do not fail the whole service

---

## 10. Final Recommendation

Implement project memory in `ravens.core` as a **hybrid SQLite-first RAG subsystem**:

- keep `memory_entries` as the canonical memory table
- add `memory_chunks` for retrieval granularity
- use **FTS5** for keyword search
- use **`sqlite-vec`** for vector search when available
- fall back to a **simple file-based vector index** if not
- inject top ranked chunks into `buildRuntimeContract()` as a structured `projectMemory` field

This gives Ravens a robust, lightweight memory system that fits the current stack, avoids heavy infrastructure, and can evolve safely over time.
