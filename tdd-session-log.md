# TDD Session Log — embedChunks
[PLAN] returns empty array for empty input <- Z
[PLAN] returns one EmbeddedChunk for a single EnrichedChunk <- O
[PLAN] returns an EmbeddedChunk for every input chunk <- M
[PLAN] attaches the correct embedding to each chunk by index <- B
[PLAN] preserves content and metadata on each returned chunk <- I
[PLAN] throws when embedMany rejects <- E
