-- Create table with correct vector dimensions for Google gemini-embedding-001
create table documents (
  id bigserial primary key,
  content text,
  metadata jsonb,
  embedding vector(3072),
  content_hash text unique
);

-- Create the similarity search function with 3072 dims for Google
create function match_documents (
  query_embedding vector(3072),
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