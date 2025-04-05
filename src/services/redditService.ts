import Parser from 'rss-parser';
import TelegramBot from '../telegram/bot';
import { createClient } from 'redis';

// Interfaces
interface Subscription {
    subreddit: string;
    chatId: string;
    lastChecked: Date;
    lastPostId?: string;
}

// Redis setup
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({
    url: redisUrl
});

// Redis keys
const REDDIT_SUBSCRIPTIONS_KEY = 'reddit_subscriptions';

// Redis connection handling
redisClient.on('error', (err) => console.error('Reddit Service Redis Error:', err));
redisClient.on('connect', () => console.log('Reddit Service connected to Redis'));

// Connect to Redis
(async () => {
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }
})().catch(err => {
    console.error('Reddit Service failed to connect to Redis:', err);
});

const parser = new Parser();

// Poll interval in milliseconds (5 minutes)
const POLL_INTERVAL = 5 * 60 * 1000;

// Active polling intervals
const activePolling = new Set<string>();

/**
 * Get all subscriptions from Redis
 */
async function getAllSubscriptions(): Promise<Map<string, Subscription[]>> {
    try {
        const data = await redisClient.get(REDDIT_SUBSCRIPTIONS_KEY);
        if (!data) return new Map();

        // Parse the stored JSON and convert it back to a Map
        const subscriptionsObj = JSON.parse(data);
        const subscriptionsMap = new Map<string, Subscription[]>();

        // Convert the plain objects back to Map entries with proper date objects
        Object.entries(subscriptionsObj).forEach(([key, value]) => {
            const subs = (value as Subscription[]).map(sub => ({
                ...sub,
                lastChecked: new Date(sub.lastChecked)
            }));
            subscriptionsMap.set(key, subs);
        });

        return subscriptionsMap;
    } catch (error) {
        console.error('Error getting Reddit subscriptions from Redis:', error);
        return new Map();
    }
}

/**
 * Save all subscriptions to Redis
 */
async function saveAllSubscriptions(subscriptions: Map<string, Subscription[]>): Promise<boolean> {
    try {
        // Convert Map to plain object for storage
        const subscriptionsObj: Record<string, Subscription[]> = {};
        subscriptions.forEach((value, key) => {
            subscriptionsObj[key] = value;
        });

        await redisClient.set(REDDIT_SUBSCRIPTIONS_KEY, JSON.stringify(subscriptionsObj));
        return true;
    } catch (error) {
        console.error('Error saving Reddit subscriptions to Redis:', error);
        return false;
    }
}

/**
 * Subscribe to a subreddit
 */
export async function subscribeToSubreddit(subreddit: string, chatId: string): Promise<boolean> {
    // Normalize subreddit name
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, '');

    // Get current subscriptions
    const subscriptions = await getAllSubscriptions();
    const subs = subscriptions.get(normalizedSubreddit) || [];

    // Check if subscription already exists
    if (subs.some(sub => sub.chatId === chatId)) {
        return false;
    }

    // Add new subscription
    subs.push({
        subreddit: normalizedSubreddit,
        chatId,
        lastChecked: new Date()
    });

    // Update subscriptions map
    subscriptions.set(normalizedSubreddit, subs);

    // Save to Redis
    await saveAllSubscriptions(subscriptions);

    // Start polling if this is the first subscription
    if (subs.length === 1) {
        startPolling(normalizedSubreddit);
    }

    return true;
}

/**
 * Unsubscribe from a subreddit
 */
export async function unsubscribeFromSubreddit(subreddit: string, chatId: string): Promise<boolean> {
    // Normalize subreddit name
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, '');

    // Get current subscriptions
    const subscriptions = await getAllSubscriptions();
    const subs = subscriptions.get(normalizedSubreddit);
    if (!subs) {
        return false;
    }

    // Filter out the subscription
    const newSubs = subs.filter(sub => sub.chatId !== chatId);

    // Update subscriptions map
    if (newSubs.length === 0) {
        subscriptions.delete(normalizedSubreddit);

        // If there are no more subscriptions for this subreddit, we can stop polling
        if (activePolling.has(normalizedSubreddit)) {
            // Note: we can't actually stop the interval, but we'll just let it run
            // and it will exit early when it checks that there are no subscriptions
            activePolling.delete(normalizedSubreddit);
        }
    } else {
        subscriptions.set(normalizedSubreddit, newSubs);
    }

    // Save to Redis
    await saveAllSubscriptions(subscriptions);

    return true;
}

/**
 * List all subscriptions for a chat
 */
export async function listSubscriptions(chatId: string): Promise<string[]> {
    const chatSubs: string[] = [];

    // Get all subscriptions
    const subscriptions = await getAllSubscriptions();

    // Iterate through all subscriptions
    for (const [subreddit, subs] of subscriptions.entries()) {
        if (subs.some(sub => sub.chatId === chatId)) {
            chatSubs.push(subreddit);
        }
    }

    return chatSubs;
}

/**
 * Start polling for new posts
 */
function startPolling(subreddit: string): void {
    console.log(`Starting to poll r/${subreddit}`);

    // Mark as active polling
    activePolling.add(subreddit);

    // Immediately check once
    checkForNewPosts(subreddit);

    // Set interval for regular checks
    setInterval(async () => {
        // Only continue if this subreddit is still being polled
        if (activePolling.has(subreddit)) {
            await checkForNewPosts(subreddit);
        }
    }, POLL_INTERVAL);
}

/**
 * Check for new posts in a subreddit
 */
async function checkForNewPosts(subreddit: string): Promise<void> {
    // Get current subscriptions
    const subscriptions = await getAllSubscriptions();
    const subs = subscriptions.get(subreddit);

    if (!subs || subs.length === 0) {
        return;
    }

    try {
        // Fetch the RSS feed
        const feed = await parser.parseURL(`https://www.reddit.com/r/${subreddit}/new/.rss`);

        if (!feed.items || feed.items.length === 0) {
            return;
        }

        // Sort items by date (newest first)
        const sortedItems = feed.items.sort((a, b) => {
            return new Date(b.pubDate || '').getTime() - new Date(a.pubDate || '').getTime();
        });

        // Process each subscription
        let needsSave = false;

        for (const sub of subs) {
            // Find new posts since last check
            const newPosts = sortedItems.filter(item => {
                const itemDate = new Date(item.pubDate || '');
                return itemDate > sub.lastChecked && item.id !== sub.lastPostId;
            });

            // Send new posts to the Telegram chat
            if (newPosts.length > 0) {
                await sendPostsToTelegram(newPosts, sub.chatId, subreddit);

                // Update subscription with latest post information
                sub.lastChecked = new Date();
                if (newPosts[0].id) {
                    sub.lastPostId = newPosts[0].id;
                }

                needsSave = true;
            }
        }

        // Save updated subscriptions to Redis if needed
        if (needsSave) {
            subscriptions.set(subreddit, subs);
            await saveAllSubscriptions(subscriptions);
        }
    } catch (error) {
        console.error(`Error checking for new posts in r/${subreddit}:`, error);
    }
}

/**
 * Send posts to a Telegram chat
 */
async function sendPostsToTelegram(posts: Parser.Item[], chatId: string, subreddit: string): Promise<void> {
    try {
        // Send at most 5 posts to avoid spam
        const postsToSend = posts.slice(0, 5);

        for (const post of postsToSend) {
            const message = formatRedditPost(post, subreddit);
            await TelegramBot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        }

        // If there are more than 5 posts, send a notice
        if (posts.length > 5) {
            await TelegramBot.telegram.sendMessage(
                chatId,
                `_${posts.length - 5} more posts not shown. Visit r/${subreddit} to see all._`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        console.error(`Error sending posts to Telegram chat ${chatId}:`, error);
    }
}

/**
 * Fetch the latest post from a subreddit
 */
export async function fetchLatestPost(subreddit: string): Promise<Parser.Item | null> {
    try {
        // Normalize subreddit name
        const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, '');

        // Fetch the RSS feed
        const feed = await parser.parseURL(`https://www.reddit.com/r/${normalizedSubreddit}/new/.rss`);

        if (!feed.items || feed.items.length === 0) {
            return null;
        }

        // Sort items by date (newest first)
        const sortedItems = feed.items.sort((a, b) => {
            return new Date(b.pubDate || '').getTime() - new Date(a.pubDate || '').getTime();
        });

        // Return the most recent post
        return sortedItems[0];
    } catch (error) {
        console.error(`Error fetching latest post from r/${subreddit}:`, error);
        return null;
    }
}

/**
 * Format a Reddit post for sending to Telegram
 */
export function formatRedditPost(post: Parser.Item, subreddit: string): string {
    const title = post.title || 'No title';
    const link = post.link || '';
    const author = post.creator || 'unknown';

    return `*New post in r/${subreddit}*\n` +
        `*${title}*\n` +
        `Posted by u/${author}\n` +
        `${link}`;
}

// Initialize the service
export async function initRedditService(): Promise<void> {
    console.log('Reddit subscription service initializing...');

    try {
        // Ensure Redis connection
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        // Get all subscriptions
        const subscriptions = await getAllSubscriptions();

        // Start polling for each subreddit that has subscriptions
        for (const [subreddit, subs] of subscriptions.entries()) {
            if (subs.length > 0) {
                startPolling(subreddit);
            }
        }

        console.log(`Reddit subscription service initialized with ${subscriptions.size} subreddits being monitored`);
    } catch (error) {
        console.error('Error initializing Reddit subscription service:', error);
    }
} 