import { Composer } from "telegraf";
import {
    subscribeToSubreddit,
    unsubscribeFromSubreddit,
    listSubscriptions,
    fetchLatestPost,
    formatRedditPost
} from "../../services/redditService";

const reddit = new Composer();

// /sub command - Subscribe to a subreddit
reddit.command('sub', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const args = ctx.message.text.split(' ').slice(1);

    if (!args.length) {
        return ctx.reply('Please provide a subreddit name. Usage: /sub SUBREDDIT_NAME');
    }

    // Get the subreddit name from arguments
    const subreddit = args[0].trim();
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, '');

    try {
        // Try to subscribe
        const success = await subscribeToSubreddit(subreddit, chatId);

        if (success) {
            await ctx.reply(`✅ Successfully subscribed to r/${normalizedSubreddit}. New posts will be sent to this chat.`);

            // Fetch and send the latest post immediately
            await ctx.reply(`Fetching the latest post from r/${normalizedSubreddit}...`);

            const latestPost = await fetchLatestPost(normalizedSubreddit);

            if (latestPost) {
                const message = formatRedditPost(latestPost, normalizedSubreddit);
                await ctx.reply(message, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply(`No recent posts found in r/${normalizedSubreddit}.`);
            }
        } else {
            await ctx.reply(`You're already subscribed to r/${normalizedSubreddit} in this chat.`);
        }
    } catch (error) {
        console.error('Error subscribing to subreddit:', error);
        await ctx.reply('❌ There was an error processing your subscription. Please try again later.');
    }
});

// /unsub command - Unsubscribe from a subreddit
reddit.command('unsub', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const args = ctx.message.text.split(' ').slice(1);

    if (!args.length) {
        return ctx.reply('Please provide a subreddit name. Usage: /unsub SUBREDDIT_NAME');
    }

    // Get the subreddit name from arguments
    const subreddit = args[0].trim();
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, '');

    try {
        // Try to unsubscribe
        const success = await unsubscribeFromSubreddit(subreddit, chatId);

        if (success) {
            await ctx.reply(`✅ Successfully unsubscribed from r/${normalizedSubreddit}.`);
        } else {
            await ctx.reply(`You're not subscribed to r/${normalizedSubreddit} in this chat.`);
        }
    } catch (error) {
        console.error('Error unsubscribing from subreddit:', error);
        await ctx.reply('❌ There was an error processing your request. Please try again later.');
    }
});

// /subslist command - List all subscriptions
reddit.command('subslist', async (ctx) => {
    const chatId = ctx.chat.id.toString();

    try {
        // Get all subscriptions for this chat
        const subscriptions = await listSubscriptions(chatId);

        if (subscriptions.length === 0) {
            await ctx.reply('This chat is not subscribed to any subreddits.');
            return;
        }

        // Format the list
        const formattedList = subscriptions.map(sub => `• r/${sub}`).join('\n');

        await ctx.reply(`*Subreddit Subscriptions*\n${formattedList}`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error listing subscriptions:', error);
        await ctx.reply('❌ There was an error retrieving your subscriptions. Please try again later.');
    }
});

// /latest command - Get the latest post from a subreddit without subscribing
reddit.command('latest', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (!args.length) {
        return ctx.reply('Please provide a subreddit name. Usage: /latest SUBREDDIT_NAME');
    }

    // Get the subreddit name from arguments
    const subreddit = args[0].trim();
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, '');

    try {
        await ctx.reply(`Fetching the latest post from r/${normalizedSubreddit}...`);

        const latestPost = await fetchLatestPost(normalizedSubreddit);

        if (latestPost) {
            const message = formatRedditPost(latestPost, normalizedSubreddit);
            await ctx.reply(message, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply(`No recent posts found in r/${normalizedSubreddit}.`);
        }
    } catch (error) {
        console.error(`Error fetching latest post from r/${normalizedSubreddit}:`, error);
        await ctx.reply('❌ There was an error fetching the latest post. Please try again later.');
    }
});

export default reddit; 