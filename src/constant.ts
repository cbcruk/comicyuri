/**
 * 책장 드롭 존의 슬롯 id. 앱의 초기 Model과 테스트 fixture가 같은 id로 드롭 존을
 * 만들도록 한 곳에 둔다.
 */
export const FILE_DROP_ID = 'shelf-file-drop'

/**
 * 파일 선택기가 받는 것. 함께 고른 낱장 이미지는 한 권으로 묶이므로 아카이브뿐
 * 아니라 이미지도 허용한다.
 */
export const ARCHIVE_ACCEPT = ['.cbz', '.zip', 'image/*']
