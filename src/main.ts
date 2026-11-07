import { mount } from 'svelte';
import './index.css';
import App from './App.svelte';
import { initI18n } from './i18n';

async function bootstrap() {
    await initI18n();
    mount(App, {
        target: document.getElementById('root') as HTMLElement
    });
}

void bootstrap();
