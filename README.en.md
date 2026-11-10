# IronLaw

**Turn engineering discipline into machinery.**

Read online (no install needed): **https://one-ok.github.io/ironlaw/en.html** · [中文](https://one-ok.github.io/ironlaw/) · [Why gates go silently green](https://one-ok.github.io/ironlaw/why.html) (Chinese)

A skill suite for WorkBuddy that solves one narrow problem:

> AI and humans can both write code that *looks* correct. Almost nobody can prove it.

IronLaw does not make you type faster. It makes the phrase "this change is trustworthy" **provable** — by turning every judgement into something a machine can check: guards, assertions, truth verification.

## What's inside

| Skill | In one line |
|---|---|
| `ironlaw` | Router — one sentence in, the right discipline out |
| `ironlaw-change` | Change discipline: six opening questions → root cause → impact chain → fix → retrospective |
| `ironlaw-gate` | Gate engineering: turn a judgement into a checkable guard, and prove that breaking it turns red |
| `ironlaw-record` | Change records: seven-section record + machine-executable assertion table + three-part commit message |
| `ironlaw-ship` | Ship closure: push → package → deploy → verify live truth → ledger |
| `ironlaw-bootstrap` | Project scaffold: hooks, guards, shared modules, doc templates for a new repo |

Plus **6 slash commands** and **4 zero-dependency Node tools**.

## The four iron laws

Everything stands on four laws. Break any one and the rest degrades into documentation:

1. **Required means fail-closed.** Missing file, missing section, empty data branch — must go red. Letting it pass means the clause does not exist.
2. **Every new guard needs a reverse probe.** Remove the protection and it must turn red, then restore byte-for-byte. A guard you never tried to break is not a guard.
3. **One source of truth per rule.** A single judgement gets a single implementation. Two regexes vouching for each other is not redundancy, it is a blind spot.
4. **Close the impact chain with machine-computed coverage, key by key.** Name what was missed. "I checked everything" is not a closure.

## The five stages

```
① bootstrap  Once: lay the rails (new projects only)
      ↓
② change     Every change: six questions → root cause → impact chain → fix
      ↓
③ gate       Nail this change's judgement into a machine-checkable guard
      ↓
④ record     Seven-section record + §2.5 assertions + three-part commit message
      ↓
⑤ ship       Push → package → deploy → verify live truth → ledger
```

You do not run all five every time:

- One line of copy → ② only
- Product code → ②③④⑤
- A guard only → ②③④
- New project → ①, then wait for the first real change

## Install

No need to clone: grab the release package **[ironlaw-1.2.0.zip](https://github.com/One-OK/ironlaw/releases/download/v1.2.0/ironlaw-1.2.0.zip)**, unzip it, then run `node scripts/install.mjs`.

```bash
node scripts/install.mjs
```

It self-checks the package, copies 6 skills to `~/.workbuddy/skills/`, re-verifies after writing, then prints the available commands.

```bash
node scripts/install.mjs --dry-run        # show what would happen
node scripts/install.mjs --prune-legacy   # archive older standalone skills (never deletes)
node scripts/install.mjs --list           # list package contents
node scripts/install.mjs --target <dir>   # install into a project-level .workbuddy/skills
```

Restart your WorkBuddy session afterwards so the skills get scanned.

### Also works with Claude Code / Codex

SKILL.md is a portable format — just point the installer elsewhere:

```bash
# Claude Code: install into the user-level skills directory
node scripts/install.mjs --target ~/.claude/skills

# Codex / anything reading the AGENTS.md standard: the scaffold works as-is
node plugins/ironlaw/skills/ironlaw-bootstrap/scripts/init-project.mjs /path/to/repo
```

The scaffold's `AGENTS.md` follows the open [agents.md](https://agents.md) format (Codex reads it natively). Claude Code reads `CLAUDE.md` — add a single `@AGENTS.md` line there to share the same source of truth. **Do not copy the file twice** (iron law 3 applies to docs too).

### Alternative: mount as a plugin marketplace

The repo root carries `.codebuddy-plugin/marketplace.json` and `plugins/ironlaw/` is a complete plugin
(with `commands/` and `skills/`). Add this repo root as a *directory* marketplace in WorkBuddy.

The only difference: the plugin form also enables `commands/`, so slash commands come with argument hints.

## How to invoke

| Form | Example |
|---|---|
| Slash command | `/ironlaw-change` |
| Short phrase | "run this through ironlaw" |
| Natural language | "this guard keeps going green when it shouldn't" |

When unsure, use the router:

```
/ironlaw
```

## The four tools

Not samples — working code, no third-party dependencies.

```bash
# Reverse mutation: break it → must go red → restore byte-for-byte
node plugins/ironlaw/skills/ironlaw-gate/scripts/reverse-probe.mjs --config probe.json

# Execute a change record's §2.5 assertion table, report every row
node plugins/ironlaw/skills/ironlaw-record/scripts/verify-record.mjs docs/change-records/xxx.md

# Impact-chain scope keys: diff → keys → check each against assertions & reasons (machine side of law 4)
node plugins/ironlaw/skills/ironlaw-record/scripts/impact-scope.mjs --base <ref> --record docs/change-records/xxx.md

# Four-way truth check: local / remote / live / distributed
node plugins/ironlaw/skills/ironlaw-ship/scripts/ship-truth.mjs --config ship.json
```

There is also `scripts/smoke.mjs`: an end-to-end smoke test (22 checks) that reproduces every "verified" claim from the changelog on any machine.

## Docs

- [`docs/walkthrough.md`](docs/walkthrough.md) — **a complete walkthrough**: from "amounts lose two decimals" to a verified deploy. Every step, command, and output. **Start here on first use.**
- [`README.md`](README.md) — 中文版
- [`CHANGELOG.md`](CHANGELOG.md)

## Where it came from

Distilled from the engineering history of a real commercial product line: 89 guard scripts, 838 lines of
change discipline, and a long list of scars — guards that skipped and still reported green, timeouts
misread as failed assertions, root causes swallowed by a regex, hand-copied ledgers drifting from the
machine source, parallel release lines overwriting each other, and "push succeeded" while nothing was
deployed.

IronLaw extracts the **mechanisms** behind those scars, not the business code. That is why it applies to
any project where a change has to be trustworthy.

## What it deliberately does not do

- It does not decide your product. It only decides whether a change is trustworthy.
- It does not chase guard count. A guard nobody runs does not exist.
- It does not pretend. "Push succeeded" ≠ "deployed". "The script says OK" ≠ "production is new".

## License

MIT
