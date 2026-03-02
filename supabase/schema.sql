-- Enable pgvector extension
create extension if not exists vector;

-- Drop and recreate table (embed-english-v3.0 produces 1024-dim vectors)
drop table if exists documents;
create table documents (
  id bigserial primary key,
  content text,
  metadata jsonb,
  embedding vector(1024)
);

-- RLS: enable row-level security and allow public reads via the anon key
-- Without this policy, all queries return empty results
alter table documents enable row level security;

create policy "Allow public read access"
  on documents for select
  using (true);

-- Similarity search function (recreatable)
create or replace function match_documents (
  query_embedding vector(1024),
  match_count int default null,
  filter jsonb default '{}'
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
