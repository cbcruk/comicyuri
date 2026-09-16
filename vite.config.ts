import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

import { defineConfig } from 'vite-plus'
import type { Plugin } from 'vite-plus'

import tailwindcss from '@tailwindcss/vite'

// `repos/`에는 다른 프로젝트를 참고용으로 받아 둘 때 그 체크아웃이 들어간다.
// 그래서 이 프로젝트가 자기 코드에 돌리는 모든 검사에서 빼 둔다.
const VENDORED = ['repos/**', 'dist/**', 'dist-pages/**']

// GitHub Pages는 `https://cbcruk.github.io/comicyuri/`에 앱을 놓는다. 이 모드로
// 빌드하면 자산과 라우트가 그 경로 아래를 가리킨다.
const GITHUB_PAGES = 'github-pages'

// GitHub Pages에는 재작성 규칙이 없다. 대신 없는 경로에 `404.html`을 내주므로,
// `index.html`과 같은 문서를 그 이름으로 하나 더 둔다. 상태 코드는 404로 나가지만
// 브라우저는 개의치 않고 앱을 띄운다.
const pagesFallback = (): Plugin => ({
  name: 'comicyuri:github-pages-fallback',
  apply: (_, { mode }) => mode === GITHUB_PAGES,
  writeBundle: ({ dir = 'dist' }) => {
    copyFileSync(join(dir, 'index.html'), join(dir, '404.html'))
  },
})

export default defineConfig(({ mode }) => ({
  base: mode === GITHUB_PAGES ? '/comicyuri/' : '/',
  plugins: [tailwindcss(), pagesFallback()],
  optimizeDeps: {
    entries: ['src/app/main.tsx'],
  },
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    semi: false,
    singleQuote: true,
    ignorePatterns: VENDORED,
  },
  lint: {
    // 플러그인을 하나라도 적는 순간 기본 세트가 대체되므로, 원래 켜져 있던 셋을
    // `jsdoc`과 함께 다시 나열한다. jsdoc은 태그 검사 때문에 넣었다 — 오타 난
    // `@retruns`나 빈 `@example`은 그러지 않으면 그냥 지나간다. `require-param` /
    // `require-returns`는 기본값 그대로 꺼 둔다. 그 태그들은 시그니처가 말할 수
    // 없는 사실, 이를테면 특별한 반환값 같은 것에만 쓴다.
    plugins: ['typescript', 'unicorn', 'oxc', 'jsdoc'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'jsdoc/check-tag-names': 'error',
      'jsdoc/empty-tags': 'error',
    },
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: VENDORED,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
  },
}))
