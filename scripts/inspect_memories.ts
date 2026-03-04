import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}

const sql = postgres(connectionString);

async function main() {
	try {
		const memories = await sql`
            SELECT m.content, m.type, m.created_at, a.name as agent_name 
            FROM memories m
            JOIN agents a ON m.agent_id = a.id
            ORDER BY m.created_at DESC
            LIMIT 50
        `;

		console.log(`Found ${memories.length} recent memories:`);
		memories.forEach((m) => {
			console.log(
				`[${m.agent_name} | ${m.type}] ${new Date(m.created_at).toLocaleString()}: ${m.content}`
			);
		});
	} catch (e) {
		console.error('Error fetching memories:', e);
	} finally {
		await sql.end();
	}
}

main();
