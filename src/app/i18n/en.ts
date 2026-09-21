/**
 * 영어 문구. 다른 언어의 카탈로그는 이것을 본떠 만든다(`S-151`).
 *
 * 값이 함수인 것은 문구에 숫자나 이름이 끼는 자리다. 문장을 밖에서 이어 붙이지 않는 이유는
 * 어순이 언어마다 다르기 때문이다 — 이어 붙이면 영어의 어순이 코드에 박힌다.
 */
export const en = {
  menu: {
    bar: 'Reader menus',
    book: 'Book',
    view: 'View',
    go: 'Go',
    play: 'Play',
    settings: 'Settings',
  },
  item: {
    shelf: '← Shelf',
    addBookmark: 'Bookmark this page',
    removeBookmark: 'Remove bookmark from this page',
    everyPage: 'Show every page',
    readFrom: 'Read from',
    rightToLeft: 'Right to left',
    leftToRight: 'Left to right',
    toggleView: 'Toggle one or two pages',
    onePage: 'One',
    twoPages: 'Two',
    fitTo: 'Fit to',
    fitPage: 'Page',
    fitWidth: 'Width',
    fitHeight: 'Height',
    fitOriginal: 'Original size',
    rotate: 'Turn the page a quarter clockwise',
    flipBinding: 'Flip how this spread is paired',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    enterFullscreen: 'Enter fullscreen',
    leaveFullscreen: 'Leave fullscreen',
    hideToolbar: 'Hide the toolbar',
    first: 'First',
    previous: 'Previous',
    next: 'Next',
    last: 'Last',
    goToPage: 'Go to page',
    nextBookmark: 'Next bookmark',
    previousBookmark: 'Previous bookmark',
    startSlideshow: 'Start the slideshow',
    stopSlideshow: 'Stop the slideshow',
    readingSettings: 'Reading settings',
  },
  footer: {
    slider: 'Page',
    /** 손잡이를 끌 때 뜨는 글자. `page`는 1부터 센 번호다. */
    sliderValue: (page: number) => `Page ${page}`,
    goToPage: 'Go to page',
    /** 번호 입력란의 라벨. 적을 수 있는 범위를 함께 적는다. */
    pageRange: (pageCount: number) => `Page (1–${pageCount})`,
    cancel: 'Cancel',
    go: 'Go',
  },
}

/** 카탈로그의 모양. 다른 언어는 여기 있는 것을 하나도 빠뜨릴 수 없다. */
export type Catalog = typeof en
