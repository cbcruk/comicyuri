/**
 * 앱 전체를 감싸는 것들. Atom 레지스트리와 Astryx 테마다.
 *
 * 레지스트리가 atom의 수명을 쥔다. 페이지 URL이 여기에 매여 있어서(`src/atoms/pages.ts`),
 * 화면이 더 이상 원하지 않는 페이지는 레지스트리가 치우며 URL도 함께 놓인다.
 *
 * 테마는 두 겹이다. Astryx 컴포넌트는 자기 토큰을 쓰고, 이 앱이 원래 쓰던 색은
 * `styles.css`의 Tailwind 토큰이다. Astryx의 `Theme`가 루트라면 `data-theme`을 문서에
 * 직접 세우므로, 두 겹이 한 속성으로 같이 움직인다(`S-142`).
 */

import { RegistryProvider } from '@effect/atom-react'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral'
import type { ReactNode } from 'react'

// 앱의 `Theme`는 색 테마 이름이고 Astryx의 `Theme`는 프로바이더 컴포넌트다. 이름이 겹쳐
// 여기서만 갈라 부른다.
import type { Theme as ThemeName } from '../types.ts'

/** 앱이 고른 테마를 Astryx가 쓰는 이름으로 옮긴다. */
const modeOf = (theme: ThemeName): 'light' | 'dark' => (theme === 'light' ? 'light' : 'dark')

export const Providers = ({
  theme,
  children,
}: Readonly<{ theme: ThemeName; children: ReactNode }>) => (
  <RegistryProvider>
    <Theme theme={neutralTheme} mode={modeOf(theme)}>
      {children}
    </Theme>
  </RegistryProvider>
)
