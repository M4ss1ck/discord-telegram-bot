import { Telegraf } from 'telegraf';
import { TG_TOKEN } from '../config';
import start from './middleware/start';
import bridge from './middleware/bridge';
import reddit from './middleware/reddit';

if (!TG_TOKEN) {
    throw new Error('BOT_TOKEN is required!');
}
const bot = new Telegraf(TG_TOKEN);

// Use middleware
bot.use(start);
bot.use(bridge);
bot.use(reddit);

// Add a catch-all message handler to forward messages to Discord
// (The actual forwarding logic is in the bridge.ts file)

export default bot;