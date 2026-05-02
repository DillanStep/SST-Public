# Governance

SST is maintained as a community source-available project. The goal is to keep the project useful for DayZ server owners while protecting user security, player privacy, licensing terms, and maintainability.

## Maintainer Responsibilities

Maintainers may:

- Triage issues and discussions.
- Review, request changes, approve, or merge pull requests.
- Manage releases, documentation, labels, and repository settings.
- Close stale, duplicate, unsafe, or out-of-scope issues.
- Remove content that violates the code of conduct or exposes private data.

Maintainers should:

- Explain review feedback clearly.
- Prefer small, focused pull requests.
- Avoid merging risky changes without adequate testing.
- Keep secrets, player data, and server-owner security in mind.

## Contributor Path

Most contributors start by opening issues, improving documentation, testing fixes, or submitting pull requests from forks. Contributors who consistently provide helpful, scoped work may be invited to maintain specific areas of the project.

## Decision Making

For small fixes, maintainer review is enough. Larger changes should have an issue or discussion first, especially when they affect:

- Public API behavior.
- Authentication, permissions, or secrets.
- DayZ mod command execution.
- File storage paths or hosted-provider support.
- Mission templates or map-specific behavior.
- User-facing dashboard workflows.

When there is disagreement, maintainers should choose the option that is safest, easiest to maintain, and least surprising for server owners.

## Releases

Release notes should call out:

- Breaking changes.
- Required configuration changes.
- Security fixes.
- Migration steps.
- Known limitations.

## Security

Security issues follow [SECURITY.md](SECURITY.md), not public issue discussion.
