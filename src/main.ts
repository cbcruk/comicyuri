import './style.css'
import { App } from './app.ts'

const root = document.querySelector<HTMLDivElement>('#app')!
const app = new App(root)
void app.start()
