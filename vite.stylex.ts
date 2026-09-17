/**
 * StyleX를 앱 빌드에 붙이는 설정. 앱(`vite.config.ts`)과 화면 테스트
 * (`vitest.screen.config.ts`)가 함께 쓴다.
 *
 * Astryx는 미리 컴파일한 `astryx.css`로도 오지만, 여기서는 그것을 쓰지 않고 소스에서 앱과
 * 함께 컴파일한다. Astryx 공식 Vite 예제(`apps/example-vite`)가 그렇게 하고, 그래야 앱의
 * StyleX와 Astryx의 StyleX가 한 번의 컴파일에서 우선순위를 나눠 가지며, 쓰지 않는 컴포넌트의
 * 스타일이 번들에 실리지 않는다.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import stylex from '@stylexjs/unplugin'
import type { Plugin, UserConfig } from 'vite-plus'

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * StyleX의 내부 lightningcss가 겨냥할 브라우저.
 *
 * 기본값(`browserslist('>= 1%')`)에는 `light-dark()`를 모르는 브라우저가 들어 있어서, 그대로
 * 두면 Astryx 토큰의 `light-dark()`가 폴리필 변수로 낮춰지며 테마 색이 소리 없이 깨진다.
 * `light-dark()`가 들어온 판을 바닥으로 잡는다.
 */
const LIGHTNINGCSS_TARGETS = {
  chrome: 123 << 16,
  firefox: 120 << 16,
  safari: (17 << 16) | (5 << 8),
}

/**
 * Vite가 CSS를 압축할 때 겨냥할 브라우저. {@linkcode LIGHTNINGCSS_TARGETS}와 같은 바닥이다.
 *
 * StyleX의 것만 맞추면 앱 CSS 절반만 원래대로 남는다. Vite도 압축하면서 lightningcss로
 * `light-dark()`를 낮추므로, 두 단계가 같은 브라우저를 봐야 CSS 전체가 한 방식으로 선다.
 */
export const CSS_TARGET = ['chrome123', 'firefox120', 'safari17.5']

/**
 * CSS 레이어의 차례. 뒤에 오는 것이 이긴다.
 *
 * StyleX는 우선순위를 `priority1`~`priority9` 레이어로 나눠 싣는다. Astryx 토큰을 덮는 테마가
 * 그 위에 서고, 옮기는 동안 남아 있는 Tailwind 유틸리티가 맨 위에서 모두를 덮는다 — 지금까지
 * `className`으로 Astryx 컴포넌트를 덮어 온 것이 그대로 통하도록.
 */
const LAYER_ORDER = [
  'reset',
  'theme',
  'base',
  ...Array.from({ length: 9 }, (_, at) => `priority${at + 1}`),
  'astryx-theme',
  'components',
  'utilities',
]

/** 레이어 차례를 문서 머리 맨 앞에 선언한다. 어떤 스타일시트보다 먼저 와야 차례가 선다. */
const layerOrder = (): Plugin => ({
  name: 'comicyuri:css-layer-order',
  transformIndexHtml: () => [
    {
      tag: 'style',
      children: `@layer ${LAYER_ORDER.join(', ')};`,
      injectTo: 'head-prepend',
    },
  ],
})

/**
 * HTTP 서버가 없는 개발 서버에서는 StyleX의 서버 훅을 건너뛴다.
 *
 * 그 훅은 CSS가 바뀌었는지 150ms마다 보는 간격 타이머를 걸고, `httpServer`가 `close`를 낼
 * 때에야 멈춘다. 화면 테스트는 Vite 서버를 둘 띄우는데 그중 하나가 미들웨어 모드라
 * `httpServer`가 없어서, 타이머가 멈추지 않고 테스트가 끝난 뒤에도 프로세스를 10초 붙잡는다.
 * 그 서버는 브라우저에 CSS 갱신을 밀어 줄 일이 없으므로 훅이 없어도 잃는 것이 없다.
 */
const skipServerHookWithoutHttp = (plugin: Plugin): Plugin => {
  const hook = plugin.configureServer
  if (hook === undefined) return plugin

  const handler = typeof hook === 'function' ? hook : hook.handler
  return {
    ...plugin,
    configureServer(server) {
      if (server.httpServer === null) return
      return handler.call(this, server)
    },
  }
}

/** StyleX 컴파일러와 레이어 차례. `stylex`가 React 변환보다 앞에 서야 한다. */
export const stylexPlugins = (): Array<Plugin> => [
  layerOrder(),
  skipServerHookWithoutHttp(
    stylex.vite({
      dev: process.env['NODE_ENV'] !== 'production',
      runtimeInjection: false,
      treeshakeCompensation: true,
      useCSSLayers: true,
      unstable_moduleResolution: { type: 'commonJS', rootDir: root },
      lightningcssOptions: { targets: LIGHTNINGCSS_TARGETS },
    }),
  ),
]

/**
 * Astryx를 소스로 읽게 하는 해석 규칙.
 *
 * 미리 번들하면(`optimizeDeps`) `stylex.create`·`defineVars` 호출이 벗겨진 채 실려
 * 런타임에서 죽으므로 뺀다.
 *
 * 빼는 대신 Astryx 소스가 부르는 CommonJS 의존성은 직접 미리 번들 목록에 올린다. 뺀 패키지
 * 안에서 불리는 것은 개발 서버가 스스로 찾아 주지 않아서, 그대로 두면 `react/jsx-runtime`이
 * 변환 없이 나가 `jsx`를 내보내지 않는다는 오류로 화면 전체가 서지 않는다. 빌드는 이 목록과
 * 상관없이 번들러가 처리하므로 개발 서버와 화면 테스트에서만 드러난다.
 */
export const astryxFromSource: Pick<UserConfig, 'resolve' | 'optimizeDeps'> = {
  resolve: {
    alias: {
      '@astryxdesign/core/theme/tokens.stylex': path.resolve(
        root,
        'node_modules/@astryxdesign/core/src/theme/tokens.stylex.ts',
      ),
      '@astryxdesign/core': path.resolve(root, 'node_modules/@astryxdesign/core/src'),
    },
  },
  optimizeDeps: {
    exclude: ['@astryxdesign/core', '@astryxdesign/theme-neutral'],
    include: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
    ],
  },
}
