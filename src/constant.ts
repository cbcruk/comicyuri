/**
 * Slot id for the shelf's drop zone. The Submodel and the view have to name
 * the same id or the drop zone renders into nothing.
 */
export const FILE_DROP_ID = 'shelf-file-drop'

/**
 * What the file picker and the drop zone will take. Loose images are allowed
 * alongside archives because a folder of images imports as one book.
 */
export const ARCHIVE_ACCEPT = ['.cbz', '.zip', 'image/*']
