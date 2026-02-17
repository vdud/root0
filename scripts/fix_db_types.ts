import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL is not set');
}

const sql = postgres(connectionString);

async function main() {
	console.log('🛠️ Fixing Database Column Types and Constraints...');

	try {
		// 1. Fix memories.agent_id type
		console.log('1. Altering memories.agent_id to UUID...');
		await sql`
            ALTER TABLE memories 
            ALTER COLUMN agent_id TYPE uuid USING agent_id::uuid;
        `;
		console.log('✅ memories.agent_id converted to UUID.');

		// 2. Add Foreign Key Constraint for memories.agent_id -> agents.id
		console.log('2. Adding FK: memories.agent_id -> agents.id...');
		try {
			await sql`
                ALTER TABLE memories
                ADD CONSTRAINT fk_memories_agents
                FOREIGN KEY (agent_id) REFERENCES agents(id);
            `;
			console.log('✅ FK fk_memories_agents added.');
		} catch (e: any) {
			if (e.code === '42710') {
				console.log('ℹ️ Constraint fk_memories_agents already exists.');
			} else {
				throw e;
			}
		}

		// 3. Add Foreign Key Constraint for agents.owner -> users.wallet_address
		console.log('3. Adding FK: agents.owner -> users.wallet_address...');
		try {
			await sql`
                ALTER TABLE agents
                ADD CONSTRAINT fk_agents_users
                FOREIGN KEY (owner) REFERENCES users(wallet_address);
            `;
			console.log('✅ FK fk_agents_users added.');
		} catch (e: any) {
			if (e.code === '42710') {
				console.log('ℹ️ Constraint fk_agents_users already exists.');
			} else if (e.code === '23503') {
				console.warn(
					'⚠️ Could not add constraint because some agents have owners that do not exist in users table.'
				);
				console.warn('   You might need to sync users first or clean up orphan agents.');
			} else {
				throw e;
			}
		}
	} catch (e) {
		console.error('❌ Migration Failed:', e);
	} finally {
		await sql.end();
	}
}

main();
