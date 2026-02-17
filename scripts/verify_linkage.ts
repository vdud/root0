import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { users, agents, memories } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL is not set');
}

const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
	console.log('🔍 Verifying Database Schema and Linkage...');

	try {
		// 1. Verify Users Table
		const walletAddress = '0x1234567890123456789012345678901234567890';
		console.log(`\n1. Upserting User (${walletAddress})...`);
		await db
			.insert(users)
			.values({
				walletAddress,
				lastSeen: new Date()
			})
			.onConflictDoUpdate({
				target: users.walletAddress,
				set: { lastSeen: new Date() }
			});
		console.log('✅ User upserted.');

		// 2. Verify Agent Creation
		console.log('\n2. Creating Agent linked to User...');
		const agentId = crypto.randomUUID();
		await db.insert(agents).values({
			id: agentId,
			name: 'Verification Bot',
			owner: walletAddress,
			status: 'stopped'
		});
		console.log(`✅ Agent created (ID: ${agentId}, Owner: ${walletAddress})`);

		// 3. Verify Memory Creation
		console.log('\n3. Creating Memory linked to Agent...');
		const memoryContent = 'I remember being verified.';
		await db.insert(memories).values({
			agentId: agentId, // This should trigger error if agentId is not UUID and column is UUID
			content: memoryContent,
			type: 'test'
		});
		console.log('✅ Memory created.');

		// 4. Verify Fetching
		console.log('\n4. Verifying Data Linkage...');
		const fetchedMemories = await db.select().from(memories).where(eq(memories.agentId, agentId));
		if (fetchedMemories.length > 0 && fetchedMemories[0].content === memoryContent) {
			console.log('✅ Successfully fetched memory by Agent ID.');
		} else {
			console.error('❌ Failed to fetch memory.');
		}

		// Clean up
		console.log('\n🧹 Cleaning up test data...');
		await db.delete(memories).where(eq(memories.agentId, agentId));
		await db.delete(agents).where(eq(agents.id, agentId));
		await db.delete(users).where(eq(users.walletAddress, walletAddress));
		console.log('✅ Cleanup complete.');
	} catch (e) {
		console.error('❌ Verification Failed:', e);
	} finally {
		await client.end();
	}
}

main();
