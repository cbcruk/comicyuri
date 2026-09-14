import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineView } from 'foldkit/submodel'

import { Input, Slider } from '@foldkit/ui'
import clsx from 'clsx'

import { controlView } from '../../view/control.ts'
import { settingsView } from '../../view/settings.ts'
import { GOTO_ID } from './constant.ts'
import { Message } from './message.ts'
import { Model, OpenState } from './model.ts'
import { indexOfPage, pagesAt, spreadsFor } from './spread.ts'
import { sliderPage } from './update.ts'
import { stageView } from './view/stage.ts'
import { thumbsView } from './view/thumbs.ts'
import { chromeAttributes, chromeClassName, toolbarView } from './view/toolbar.ts'

/**
 * 책 전체를 훑는 자리. 키보드 지원은 컴포넌트가 가져다준다.
 *
 * thumb은 가장 가까운 positioned 조상인 이 루트의 비율로 놓이고, 트랙은 그 루트의
 * 너비를 채운다. 여기 흐름에 다른 것이 끼면 thumb은 그대로인 채 트랙만 좁아지므로,
 * 폼 `name` 없이는 아무것도 나르지 않는 컴포넌트의 숨은 input은 빼 두었다.
 */
const sliderView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const isRightToLeft = model.settings.direction === 'rtl'

  return h.submodel({
    slotId: model.slider.id,
    model: model.slider,
    view: Slider.view,
    viewInputs: {
      // 오른쪽에서 왼쪽으로 읽을 때는 슬라이더 값이 반대로 간다. 그래야 슬라이더
      // 자신의 화살표 키와 드래그가 기대한 쪽을 가리킨다. 라벨은 다시 되돌리는데,
      // 페이지 번호는 뒤집히지 않기 때문이다.
      value: sliderPage(model, model.page),
      ariaLabel: 'Page',
      formatValue: (value) => `Page ${sliderPage(model, value) + 1}`,
      toView: (attributes) =>
        h.div(
          [
            ...attributes.root,
            h.Class('relative flex h-6 flex-1 touch-none items-center select-none'),
          ],
          [
            // 컴포넌트는 늘 자기 최솟값부터 채우는데, 오른쪽에서 왼쪽으로 읽으면
            // 그 끝이 책의 끝이다. 그래서 이 방향에서는 두 색이 자리를 바꾼다.
            // 트랙이 길이 전체에 읽은 색을 깔고, 컴포넌트의 채움이 아직 읽지 않은
            // 만큼을 덮는다.
            h.div(
              [
                ...attributes.track,
                h.Class(clsx('h-1.5 w-full rounded-full', isRightToLeft ? 'bg-accent' : 'bg-edge')),
              ],
              [
                h.div([
                  ...attributes.filledTrack,
                  h.Class(clsx('h-full rounded-full', isRightToLeft ? 'bg-edge' : 'bg-accent')),
                ]),
              ],
            ),
            h.div([
              ...attributes.thumb,
              h.Class(
                'h-4 w-4 cursor-grab rounded-full border-2 border-accent bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-dragging:cursor-grabbing',
              ),
            ]),
          ],
        ),
    },
    toParentMessage: (message) => Message.GotSliderMessage({ message }),
  })
}

/**
 * 번호를 적어 그 페이지로 가는 자리.
 *
 * 값을 Model에 두지 않는다. 적는 동안 리더가 그것을 고쳐 쓰면 손가락과 싸우게
 * 되고, 여기서 필요한 것은 다 적은 뒤의 한 번뿐이다 — Enter를 누르거나 입력란을
 * 떠날 때 `change`가 그것을 준다. 지금 어디인지는 자리표시자가 말해 준다.
 */
const goToPageView = (page: number, h: HtmlBuilder<Message>): Html =>
  Input.view(
    {
      id: GOTO_ID,
      type: 'number',
      placeholder: String(page + 1),
      toView: (attributes) =>
        h.input([
          ...attributes.input,
          h.Class(
            'w-16 rounded-lg border border-edge bg-surface-2 px-2 py-1.5 text-center text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          ),
          h.AriaLabel('Go to page'),
          h.OnChange((text) => Message.SubmittedGoToPage({ text })),
        ]),
    },
    h,
  )

const turnView = (model: Model, isVisible: boolean, h: HtmlBuilder<Message>): Html =>
  h.footer(
    [
      h.Class(
        clsx(
          'flex items-center justify-between gap-2 border-t border-edge px-4 py-2',
          // Next는 다음 페이지가 오는 쪽, 그러니까 이제 슬라이더가 채워지기
          // 시작하는 쪽에 선다.
          { 'flex-row-reverse': model.settings.direction === 'rtl' },
          chromeClassName(isVisible),
        ),
      ),
      ...chromeAttributes(isVisible, h),
    ],
    [
      controlView({ label: 'First', message: Message.ClickedFirst() }, h),
      controlView({ label: 'Previous', message: Message.ClickedPrevious() }, h),
      sliderView(model, h),
      goToPageView(model.page, h),
      controlView({ label: 'Next', message: Message.ClickedNext() }, h),
      controlView({ label: 'Last', message: Message.ClickedLast() }, h),
    ],
  )

/**
 * 저장된 자리로 갈지 묻는 줄.
 *
 * 답을 받기 전까지 사라지지 않는다. 툴바와 함께 숨으면 답할 기회가 없어지고,
 * 첫 장부터 읽기 시작했다고 해서 물음이 상해 있지도 않다 — 그 자리는 여전히
 * 거기 있다.
 */
const resumeView = (page: number, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Class(
        'flex flex-wrap items-center gap-2 border-b border-edge bg-surface-2 px-4 py-2 text-sm',
      ),
      h.Role('status'),
    ],
    [
      h.span([h.Class('mr-auto text-muted')], [`You left this book on page ${page + 1}`]),
      controlView({ label: 'Go there', message: Message.ClickedResume({ page }) }, h),
      controlView(
        {
          label: 'Stay',
          message: Message.ClickedDismissResume(),
          attributes: [h.AriaLabel('Stay on the first page')],
        },
        h,
      ),
    ],
  )

const openingView = (text: string, h: HtmlBuilder<Message>): Html =>
  h.main(
    [h.Class('flex h-full flex-col items-center justify-center gap-3 p-6')],
    [
      h.p([h.Class('text-sm text-muted')], [text]),
      controlView({ label: '← Shelf', message: Message.ClickedExit() }, h),
    ],
  )

/**
 * 리더를 그린다. 툴바, 이어 가기 줄, 화면, 넘김 버튼 줄을 위에서 아래로 쌓고, 열려
 * 있다면 페이지 격자와 설정 패널을 더한다.
 */
export const view = defineView<Model, Message>((model, h): Html =>
  OpenState.match(model.openState, {
    Opening: () => openingView('Opening…', h),
    Failed: ({ text }) => openingView(text, h),
    Ready: ({ title, pageCount, ratios, names }) => {
      const layout = { pageCount, ratios, marks: model.marks }
      const spreads = spreadsFor(layout, model.settings)
      const index = indexOfPage(spreads, model.page)
      const here = pagesAt(spreads, index)

      return h.main(
        [h.Class('relative flex h-full flex-col'), h.AriaLabel(title)],
        [
          toolbarView(model, here, pageCount, names, model.isChromeVisible, h),
          Option.match(model.maybeResumePage, {
            onNone: () => h.empty,
            onSome: (page) => resumeView(page, h),
          }),
          stageView(model, layout, h),
          turnView(model, model.isChromeVisible, h),
          model.isThumbsOpen ? thumbsView(model, pageCount, h) : h.empty,
          model.isSettingsOpen
            ? settingsView(
                model.settings,
                {
                  title: 'Reading settings',
                  idPrefix: 'reader',
                  onClose: Message.ClickedToggleSettings(),
                  onToggleCoverAlone: (isChecked) => Message.ToggledCoverAlone({ isChecked }),
                  onToggleSplitWide: (isChecked) => Message.ToggledSplitWide({ isChecked }),
                  onToggleEnlargeToFit: (isChecked) => Message.ToggledEnlargeToFit({ isChecked }),
                  onToggleRememberBookSettings: (isChecked) =>
                    Message.ToggledRememberBookSettings({ isChecked }),
                  onNudgeThreshold: (by) => Message.ClickedNudgeThreshold({ by }),
                  onNudgeSlideSeconds: (by) => Message.ClickedNudgeSlideSeconds({ by }),
                  onSelectAtBookEnd: (atBookEnd) => Message.SelectedAtBookEnd({ atBookEnd }),
                  onSelectResume: (resume) => Message.SelectedResume({ resume }),
                },
                h,
              )
            : h.empty,
        ],
      )
    },
  }),
)
