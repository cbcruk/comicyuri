/**
 * GitHub Pages를 흉내내는 정적 서버. `vp preview`는 없는 경로에 스스로
 * `index.html`을 내주므로, 그 위에서는 Pages에 필요한 `404.html`이 빠져도 알 수
 * 없다. 여기서는 Pages처럼 행동한다.
 *
 * - 앱은 `/comicyuri/` 아래에만 있다.
 * - 끝의 슬래시 없이 온 `/comicyuri`는 슬래시를 붙인 곳으로 보낸다.
 * - 없는 파일에는 `404.html`을 상태 404로 내준다. 재작성 규칙은 없다.
 *
 * 쓰는 법: `node e2e/fixture/pages-host.ts <dir> <port>`
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const BASE = '/comicyuri'

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const [root = 'dist-pages', port = '4174'] = process.argv.slice(2)

const fileAt = (pathname: string): string | undefined => {
  const file = join(root, normalize(decodeURIComponent(pathname)))
  if (!existsSync(file)) {
    return undefined
  }
  if (statSync(file).isDirectory()) {
    const index = join(file, 'index.html')
    return existsSync(index) ? index : undefined
  }
  return file
}

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')

  if (pathname === BASE) {
    response.writeHead(301, { location: `${BASE}/` }).end()
    return
  }
  if (!pathname.startsWith(`${BASE}/`)) {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('Not Found')
    return
  }

  const file = fileAt(pathname.slice(BASE.length))
  if (file === undefined) {
    const fallback = join(root, '404.html')
    if (!existsSync(fallback)) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('Not Found')
      return
    }
    response.writeHead(404, { 'content-type': TYPES['.html'] }).end(readFileSync(fallback))
    return
  }

  response
    .writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    .end(readFileSync(file))
}).listen(Number(port))
