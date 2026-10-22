# EnvPilot

EnvPilot is a read-only developer environment doctor for Node.js and Python projects. It inspects project markers, declared runtime requirements, lockfiles, dependency declarations, and environment key contracts, then explains what may prevent the project from running on this machine.

EnvPilot does not install packages, update dependencies, rewrite lockfiles, change system configuration, or fix the project automatically.

## Requirements

- Node.js 20.9 or newer
- Python is optional; it is only probed when a Python project is detected

## Install

From this repository:

```sh
npm install
npm run build
npm link
```

After linking, the CLI is available as `envpilot`.

You can also run the built CLI directly:

```sh
node dist/cli/index.js --help
```

## Commands

```sh
envpilot scan
envpilot scan ./my-project
envpilot scan ./my-project --format json
envpilot scan ./my-project --format markdown
envpilot doctor ./my-project
envpilot report ./my-project --format markdown
envpilot report ./my-project --format json
envpilot rules
envpilot --help
```

### `scan`

Runs all applicable checks and prints a compact diagnosis. Failures and warnings include safe evidence and a recommendation. The default output is a terminal view.

### `doctor`

Prints the full diagnostic view, including passed and skipped checks, their evidence, impact, recommendations, and scoring limitations.

### `report`

Prints a clean JSON or Markdown export to stdout. It does not write files itself. To save a report, redirect stdout:

```sh
envpilot report . --format markdown > ENVIRONMENT_REPORT.md
```

### `rules`

Lists every rule, category, severity, scoring weight, applicable project type, and the score formula.

### Options

- `--format terminal|json|markdown` for `scan`
- `--format json|markdown` for `report`
- `--check-env` enables local environment key-name comparison
- `--local-env-file <path>` selects a local env file and enables key comparison; the file must resolve inside the project. The flag is named separately from Node.js's own `--env-file` option so Node does not load the file before EnvPilot runs.
- `--no-color` disables terminal colors when placed before the subcommand

### Exit codes

- `0`: scan completed with no failing findings
- `1`: scan completed and at least one finding has status `fail`
- `2`: unsupported project, missing path, or invalid invocation

Warnings alone do not produce a non-zero exit code.

## Supported project markers

Node.js markers:

- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `yarn.lock`
- `.nvmrc`
- `.node-version`

Python markers:

- `pyproject.toml`
- `requirements*.txt` (for example `requirements.txt`, `requirements-dev.txt`)
- `requirements/*.txt` (for example `requirements/base.txt`)
- `Pipfile`
- `.python-version`

Mixed repositories are supported when both Node.js and Python markers are present.

## What is checked

| Rule | What it verifies |
| --- | --- |
| `node-manifest` | `package.json` exists, parses as JSON, and has a usable shape |
| `node-runtime-engines` | Active Node.js version against `engines.node` |
| `node-package-manager` | `packageManager` declaration against lockfile evidence |
| `node-lockfile` | Lockfile presence and competing lockfiles |
| `node-lockfile-consistency` | Manifest dependency names in the selected lockfile |
| `node-dependency-metadata` | Dependency entries are non-empty strings |
| `python-interpreter` | Availability of an allowlisted Python executable |
| `python-runtime-version` | Interpreter against `.python-version`, `requires-python`, and Pipfile |
| `python-dependency-sources` | Competing Python dependency declaration files |
| `python-dependency-parse` | TOML, `requirements*.txt`, and Pipfile syntax |
| `env-template` | Presence and readability of `.env.example` and related templates |
| `env-required-keys` | Required key names declared by templates |
| `env-local-keys` | Required key names present in a local env file, only with `--check-env` |

Every finding contains a stable ID, status (`pass`, `warning`, `fail`, or `skipped`), severity, message, safe evidence, impact, and recommendation.

## Readiness score

The score is a summary of EnvPilot's checklist. It is not a probability that a build will succeed and it is not a security score.

```text
score = max(0, 100 - sum(deductions))

fail    deduction = rule weight
warning deduction = ceil(rule weight / 2)
pass    deduction = 0
skipped deduction = 0
```

The full rule and weight table is available with:

```sh
envpilot rules
```

A score is withheld when fewer than two checks have enough reliable data, when no runtime requirement could be evaluated, or when less than half of the relevant checks have data. The report includes limitations and checklist coverage so skipped checks are visible. A low coverage value means more of the checklist was skipped.

## Privacy and safety

- All checks are read-only.
- Reports are printed to stdout; EnvPilot does not write report files.
- Environment values are never included in findings or reports. With `--check-env`, only key names are compared.
- `.env` is not read unless `--check-env` or `--local-env-file` is used.
- File reads are limited to known project files, with a 1 MiB per-file limit.
- Symbolic links are not followed for project files.
- External executables are limited to fixed Python probes (`python --version`, `python3 --version`, or `py -3 --version` depending on platform).
- External commands use `execFile` with `shell: false` and a short timeout. Arbitrary shell commands are never executed.
- Package manager executables are not invoked. Package manager checks use declarations and lockfile evidence only.
- No dependency installation, upgrade, lockfile rewrite, or automatic repair occurs.

## Honest limitations

- Deep lockfile consistency checks are strongest for npm `package-lock.json`. pnpm and Yarn checks are name-based only.
- The actual package manager version is not probed; only the `packageManager` declaration and lockfile evidence are checked.
- Python version parsing follows PEP 440. Unsupported or ambiguous formats produce a warning instead of a compatibility claim.
- `build-system.requires` is treated as build tooling, not as a runtime dependency declaration.
- Requirements included indirectly with `-r` are not followed.
- EnvPilot does not scan source code for vulnerabilities.
- Unsupported project layouts are reported clearly instead of being guessed.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

Tests use Vitest. Integration tests execute the built CLI. Fixtures live in `fixtures/` and include healthy, broken, Python, mixed, and unsupported projects.

Manual examples:

```sh
node dist/cli/index.js scan fixtures/node-healthy --check-env
node dist/cli/index.js scan fixtures/node-broken --check-env
node dist/cli/index.js scan fixtures/node-broken --local-env-file .env
node dist/cli/index.js doctor fixtures/python-broken
node dist/cli/index.js report fixtures/python-healthy --format json
node dist/cli/index.js scan fixtures/unsupported
```

## License

MIT
