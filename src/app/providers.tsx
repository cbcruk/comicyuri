/**
 * 앱 전체를 감싸는 것들. Atom 레지스트리와 Astryx 테마다.
 *
 * 레지스트리가 atom의 수명을 쥔다. 페이지 URL이 여기에 매여 있어서(`src/atoms/pages.ts`),
 * 화면이 더 이상 원하지 않는 페이지는 레지스트리가 치우며 URL도 함께 놓인다.
 *
 * 색은 모두 Astryx 중립 테마에서 온다. 루트의 `Theme`는 `<html>`에 `data-theme`과
 * `data-astryx-theme`을 세우고, 테마 CSS와 `light-dark()` 토큰이 그 둘을 따라 갈라진다(`S-142`).
 */

import { RegistryProvider, useAtomValue } from '@effect/atom-react'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import type { ReactNode } from 'react'

import { themeAtom } from './shelfAtoms.ts'

/**
 * 고른 테마로 Astryx를 세운다.
 *
 * 모드를 앱 상태에서 받는 것이 요점이다. 앱을 켤 때 읽은 값을 한 번 넘기면, 책장에서 테마를
 * 바꿔도 Astryx 컴포넌트는 켤 때의 모드에 머물러 새로고침 전까지 글자가 바탕에 묻힌다.
 *
 * 테마는 미리 지은 것(`/built`)을 쓴다. 토큰이 `styles.css`가 들여오는 `theme.css`에 이미
 * 있으므로 런타임에 `<style>`을 다시 꽂을 일이 없고, 첫 페인트에도 서 있다(`S-144`).
 */
const ThemedRoot = ({ children }: Readonly<{ children: ReactNode }>) => (
  <Theme theme={neutralTheme} mode={useAtomValue(themeAtom)}>
    {children}
  </Theme>
)

/** 레지스트리와 테마를 세운다. */
export const Providers = ({ children }: Readonly<{ children: ReactNode }>) => (
  <RegistryProvider>
    <ThemedRoot>{children}</ThemedRoot>
  </RegistryProvider>
)
