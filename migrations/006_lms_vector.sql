-- Migration 006: pgvector support for lms_rag_chunks embedding.
-- On environments with pgvector (e.g. Neon PostgreSQL), installs the vector extension,
-- adds the 1536-dim vector column, and creates the HNSW index.
-- In environments without pgvector (e.g. standard PGlite), safely skips without failure.

do $$
begin
  create extension if not exists vector;
  if exists (select 1 from pg_type where typname = 'vector') then
    execute 'alter table lms_rag_chunks add column if not exists embedding vector(1536)';
    execute 'create index if not exists lms_rag_chunks_embedding_hnsw on lms_rag_chunks using hnsw (embedding vector_cosine_ops)';
  end if;
exception when others then
  raise notice 'vector extension not available in this environment, skipping vector column and index';
end $$;
