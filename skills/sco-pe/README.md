# sco-pe starter skill

A small, copyable agent skill for **building with `@lekoala/sco-pe`**.

It is intentionally not a contributor guide for the sco-pe repository. Repository development workflow belongs in `AGENTS.md` or project tooling; this skill teaches consuming applications how to use the navigation runtime without turning it into a SPA framework or inventing API.

## Contents

```text
sco-pe/
├── SKILL.md
├── README.md
├── PROJECT.md.example
├── references/
│   ├── assets-accessibility-security.md
│   ├── lifecycle-and-concurrency.md
│   ├── mental-model.md
│   ├── review-checklist.md
│   ├── server-contract.md
│   └── targeting-and-refresh.md
└── scripts/
    └── inspect-sco-pe.mjs
```

## Recommended distribution

sco-pe can ship this directory as a starter/reference skill. Consuming projects copy it into the location their coding agent uses for skills.

The copied skill should remain mostly framework-generic. Application-specific navigation choices belong in a local `PROJECT.md` created from `PROJECT.md.example`.

```text
installed sco-pe package/docs/source
        -> what exists and how the runtime works

SKILL.md + references
        -> how an agent should build with it

PROJECT.md
        -> how this application chooses to use it
```

## Why the skill does not snapshot the API

sco-pe is intentionally small and its README, `docs/server-contract.md`, package exports and source are the authoritative API for the installed version.

Copying an attribute/header catalog into the skill would create a second version that can drift. This matters especially for design documents such as `docs/multi-target.md`: they may describe future behavior before the runtime ships it.

The bundled inspector makes common lookups cheap:

```sh
node /path/to/skill/scripts/inspect-sco-pe.mjs --source
node /path/to/skill/scripts/inspect-sco-pe.mjs --exports
node /path/to/skill/scripts/inspect-sco-pe.mjs --headers
node /path/to/skill/scripts/inspect-sco-pe.mjs --defaults
node /path/to/skill/scripts/inspect-sco-pe.mjs --docs
```

Set `SCO_PE_ROOT=/path/to/sco-pe` to inspect a specific checkout or installed package.

## Customize, do not fork the navigation contract

Good project customizations include the scope map, history-owning scope, route representation rules, cache policy, status/alert regions, domain event names, component mappings, server helpers and dialog integration.

Do not use the project layer to redefine `Scope-*` semantics, turn planned design documents into shipped API, introduce arbitrary document-wide targeting, or move application behavior into the navigation runtime.
