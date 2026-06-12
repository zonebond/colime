import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import langJS from 'shiki/langs/javascript.mjs'
import langTS from 'shiki/langs/typescript.mjs'
import langTSX from 'shiki/langs/tsx.mjs'
import langJSX from 'shiki/langs/jsx.mjs'
import langJSON from 'shiki/langs/json.mjs'
import langHTML from 'shiki/langs/html.mjs'
import langCSS from 'shiki/langs/css.mjs'
import langSCSS from 'shiki/langs/scss.mjs'
import langPython from 'shiki/langs/python.mjs'
import langRuby from 'shiki/langs/ruby.mjs'
import langRust from 'shiki/langs/rust.mjs'
import langGo from 'shiki/langs/go.mjs'
import langJava from 'shiki/langs/java.mjs'
import langC from 'shiki/langs/c.mjs'
import langCpp from 'shiki/langs/cpp.mjs'
import langCSharp from 'shiki/langs/csharp.mjs'
import langSwift from 'shiki/langs/swift.mjs'
import langKotlin from 'shiki/langs/kotlin.mjs'
import langPHP from 'shiki/langs/php.mjs'
import langSQL from 'shiki/langs/sql.mjs'
import langBash from 'shiki/langs/bash.mjs'
import langShell from 'shiki/langs/shellscript.mjs'
import langYAML from 'shiki/langs/yaml.mjs'
import langXML from 'shiki/langs/xml.mjs'
import langMD from 'shiki/langs/markdown.mjs'
import langMDX from 'shiki/langs/mdx.mjs'
import langGraphQL from 'shiki/langs/graphql.mjs'
import langDocker from 'shiki/langs/docker.mjs'
import langTOML from 'shiki/langs/toml.mjs'
import langINI from 'shiki/langs/ini.mjs'
import langDiff from 'shiki/langs/diff.mjs'
import langLua from 'shiki/langs/lua.mjs'
import langVim from 'shiki/langs/viml.mjs'
import langRegexp from 'shiki/langs/regexp.mjs'
import langMakefile from 'shiki/langs/make.mjs'
import themeLight from 'shiki/themes/catppuccin-latte.mjs'
import themeDark from 'shiki/themes/catppuccin-mocha.mjs'

const engine = createJavaScriptRegexEngine()

const langs = [
  langJS, langTS, langTSX, langJSX, langJSON, langHTML, langCSS, langSCSS,
  langPython, langRuby, langRust, langGo, langJava, langC, langCpp, langCSharp,
  langSwift, langKotlin, langPHP, langSQL, langBash, langShell, langYAML,
  langXML, langMD, langMDX, langGraphQL, langDocker, langTOML, langINI,
  langDiff, langLua, langVim, langRegexp, langMakefile,
]

export async function createEngine() {
  return createHighlighterCore({
    engine,
    langs,
    themes: [themeLight, themeDark],
  })
}
