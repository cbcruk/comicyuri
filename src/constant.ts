/**
 * 책장 드롭 존의 슬롯 id. Submodel과 뷰가 같은 id를 부르지 않으면 드롭 존은
 * 아무것도 그리지 않는다.
 */
export const FILE_DROP_ID = 'shelf-file-drop'

/**
 * 파일 선택기와 드롭 존이 받는 것. 이미지 폴더가 책 한 권으로 들어오기 때문에
 * 아카이브뿐 아니라 낱장 이미지도 허용한다.
 */
export const ARCHIVE_ACCEPT = ['.cbz', '.zip', 'image/*']
