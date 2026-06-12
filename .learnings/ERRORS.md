## [ERR-20260501-001] git_push_github

**Logged**: 2026-05-01T01:36:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Git push to GitHub failed due to outbound network connectivity errors from the current environment.

### Error
```
fatal: unable to access 'https://github.com/kettly1260/Chat2API.git/': Recv failure: Connection was reset
fatal: unable to access 'https://github.com/kettly1260/Chat2API.git/': Failed to connect to github.com port 443 after 21311 ms: Could not connect to server
```

### Context
- Command attempted: `git push -u origin web`
- Repository: `G:\LLM\Chat2API`
- Branch: `web`
- Remote: `origin https://github.com/kettly1260/Chat2API.git`

### Suggested Fix
Retry the push from an environment with working outbound HTTPS access to `github.com:443`, or restore proxy/network access for the current environment.

### Metadata
- Reproducible: yes
- Related Files: .git/config

---

## [ERR-20260612-001] docker_cli_unavailable

**Logged**: 2026-06-12T06:24:46+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
Docker web image validation could not run because Docker CLI is unavailable in the current PowerShell environment.

### Error
```
docker: The term 'docker' is not recognized as a name of a cmdlet, function, script file, or executable program.
```

### Context
- Command attempted: `docker build -f Dockerfile.web -t chat2api-web:merge-smoke .`
- Repository: `G:\LLM\Chat2API`
- Task: validate web/docker runtime after merging `upstream/main` into the web integration branch.

### Suggested Fix
Install Docker Desktop or expose the Docker CLI on PATH before running container build and runtime smoke tests. Until then, rely on `npm run build:web` and `node out/main/web.js` smoke tests for local validation.

### Metadata
- Reproducible: yes
- Related Files: Dockerfile.web, docker-compose.web.yml

---
