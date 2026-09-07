import './style.css'
import { Effect } from 'effect'
import { App } from './app.ts'

const root = document.querySelector<HTMLDivElement>('#app')!

Effect.runFork(App.make(root).pipe(Effect.flatMap((app) => app.start())))
