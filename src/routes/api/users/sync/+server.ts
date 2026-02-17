import { json } from '@sveltejs/kit';
import { db } from '$lib/db';
import { users } from '$lib/db/schema';
import { sql } from 'drizzle-orm';

export async function POST({ request }) {
	const { walletAddress, email, provider, rawData } = await request.json();

	if (!walletAddress) {
		return json({ error: 'Missing walletAddress' }, { status: 400 });
	}

	try {
		await db
			.insert(users)
			.values({
				walletAddress,
				email,
				provider,
				rawData: JSON.stringify(rawData), // Store raw data as JSON string in text column
				lastSeen: new Date()
			})
			.onConflictDoUpdate({
				target: users.walletAddress,
				set: {
					lastSeen: new Date(),
					email, // Update email if it changes (or is first time)
					provider,
					rawData: JSON.stringify(rawData)
				}
			});

		return json({ success: true });
	} catch (error) {
		console.error('Error syncing user:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
}
