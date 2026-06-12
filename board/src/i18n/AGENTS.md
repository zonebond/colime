# Internationalization

## OVERVIEW

Two parallel translation files (`en.js`, `zh.js`) with a `LanguageProvider` context and `useLanguage()` hook.

## WHERE TO LOOK

| File | Purpose |
|------|---------|
| `en.js` | English strings (canonical) |
| `zh.js` | Chinese strings |
| `provider.jsx` | React context provider |
| `index.jsx` | Re-exports |
| `shared.js` | Shared constants |

## PATTERN

- Keys must exist in BOTH `en.js` and `zh.js` — never add to one only
- Access via `const { t } = useLanguage()` then `t.keyName`
- Never inline strings in JSX — always use i18n keys

## ANTI-PATTERNS

- Do NOT add hardcoded strings to components
- Do NOT create keys in only one language file
