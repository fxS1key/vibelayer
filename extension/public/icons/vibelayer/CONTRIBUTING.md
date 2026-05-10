# Contributing to VibeLayer

Thanks for being here. This project is open core — the extension, SDK, and server in this repo are MIT licensed and built in the open.

## Dev setup

```bash
git clone https://github.com/vibelayer/vibelayer
cd vibelayer
npm install
cp .env.example .env  # fill in ANTHROPIC_API_KEY or OPENAI_API_KEY

# Run server + DB
docker compose up -d postgres redis
npm run dev --workspace=@vibelayer/server

# Build extension and load extension/dist as unpacked
npm run dev --workspace=@vibelayer/extension
```

## Branch naming

- `feat/<short-name>` — new feature
- `fix/<short-name>` — bug fix
- `chore/<short-name>` — tooling, docs, CI
- `refactor/<short-name>` — no behavior change

## Commit convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(extension): add voice-input button to side panel
fix(server): reject DOM snapshots over 120KB
docs: clarify BYOK setup in README
```

## PR checklist

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] New behavior has a test (or you explain why it can't have one)
- [ ] If you changed the LLM prompt, you ran the prompt regression set (`server/test/prompts/`)
- [ ] If you changed the patch sandbox, you ran the sandbox escape tests
- [ ] Docs updated if user-facing behavior changed
- [ ] Linked to the issue this PR closes
