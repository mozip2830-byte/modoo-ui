# Development Workflow

This repo uses three long-lived branches:

- `modoo-devv`: active development
- `release`: stabilization for release
- `main`: production release branch

## Daily Development

```bash
git checkout modoo-devv
git pull
```

Make changes, then commit:

```bash
git add .
git commit -m "feat: short description"
git push
```

## Release Preparation

```bash
git checkout release
git pull
git merge modoo-devv
git push
```

## Production Release

```bash
git checkout main
git pull
git merge release
git push
```

## Notes

- Keep `main` stable and deploy only from `main`.
- Use `release` when you want a freeze/QA period.
