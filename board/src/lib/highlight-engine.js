import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import langJS from 'shiki/langs/javascript.mjs'
import langTS from 'shiki/langs/typescript.mjs'
import langJSON from 'shiki/langs/json.mjs'
import langShell from 'shiki/langs/shellscript.mjs'
import langMD from 'shiki/langs/markdown.mjs'
import langDiff from 'shiki/langs/diff.mjs'
import themeLight from 'shiki/themes/catppuccin-latte.mjs'
import themeDark from 'shiki/themes/catppuccin-mocha.mjs'

// Core languages ship in this chunk — the most common in chat output.
// Everything else lazy-loads on first use via LANG_LOADERS, so a typical
// session downloads only the grammars it actually renders.
const CORE_LANGS = [langJS, langTS, langJSON, langShell, langMD, langDiff]

// Map both canonical names and common aliases to a lazy grammar import.
// Loading a grammar registers its own aliases with the highlighter.
export const LANG_LOADERS = {
  tsx: () => import('shiki/langs/tsx.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  py: () => import('shiki/langs/python.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  rb: () => import('shiki/langs/ruby.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  rs: () => import('shiki/langs/rust.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  'c++': () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  cs: () => import('shiki/langs/csharp.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  kt: () => import('shiki/langs/kotlin.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  yml: () => import('shiki/langs/yaml.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  mdx: () => import('shiki/langs/mdx.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
  docker: () => import('shiki/langs/docker.mjs'),
  dockerfile: () => import('shiki/langs/docker.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  viml: () => import('shiki/langs/viml.mjs'),
  vim: () => import('shiki/langs/viml.mjs'),
  regexp: () => import('shiki/langs/regexp.mjs'),
  regex: () => import('shiki/langs/regexp.mjs'),
  make: () => import('shiki/langs/make.mjs'),
  makefile: () => import('shiki/langs/make.mjs'),
}

export async function createEngine() {
  return createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    langs: CORE_LANGS,
    themes: [themeLight, themeDark],
  })
}
