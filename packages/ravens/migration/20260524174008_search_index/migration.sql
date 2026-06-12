CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  session_id,
  part_id,
  message_id,
  type,
  role,
  content,
  time_created,
  tokenize='unicode61'
);
