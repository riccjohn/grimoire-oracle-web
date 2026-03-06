# CLAUDE.md / # AGENTS.md

(Update CLAUDE.md - AGENTS.md is just a symlink)

## Architecture

This is a RAG chatbot that answers TTRPG rules questions using Old School Essentials markdown files stored in `vault/`.

`DEBUG=true` enables server-side logging of query, retrieved doc count, and chunk previews. `CHATBOT_ENABLED=false` disables the LLM entirely.

Plans are found in `docs/plans`

## Remember

- Write tests FIRST before writing production code
- Check for TS errors before considering a task 'done'
