# Open source checklist (before making this repo public)

## 1) Rotate leaked credentials

This repo previously contained real tokens in `.env`. Treat them as compromised:

- Rotate/revoke Modal tokens
- Rotate/revoke OpenRouter API key

## 2) Remove secrets from git history (required)

Even after deleting `.env` in the latest commit, the secrets may still exist in git history.

Recommended (requires installing `git-filter-repo`):

```bash
# Install (macOS)
brew install git-filter-repo

# Remove the file from all history
git filter-repo --path .env --invert-paths
```

After rewriting history:

```bash
# Verify .env is gone from history
git log --oneline -- .env

# Force-push the rewritten history (only after you are sure)
# git push --force --all
# git push --force --tags
```

If you already shared the repo with others, coordinate with them first because history rewrite is disruptive.

## 3) Keep local env local

- Use `.env.example` as documentation
- Keep `.env` out of git (`.gitignore` already ignores it)

