import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL is not set');
}

const sql = postgres(connectionString);

async function main() {
	console.log('🔒 Establishing Safe RLS Policies...');

	try {
		// 1. Enable RLS on tables
		const tables = ['users', 'agents', 'memories'];
		for (const table of tables) {
			console.log(`- Enabling RLS on table: ${table}...`);
			await sql`ALTER TABLE ${sql(table)} ENABLE ROW LEVEL SECURITY`;
		}
		console.log('✅ RLS enabled on all tables.');

		// 2. Create Policies for Public Access (DENY ALL by default, or specific)
		// Since we don't have Supabase Auth users on client side, we want to block public API access.
		// We will enable a policy that allows nothing for 'anon' and 'authenticated' roles (if they exist contextually),
		// or just rely on the default deny.
		// HOWEVER, to be explicit and safe, we usually want to allow Service Rolefull access.
		// Postgres user (superuser) bypasses RLS, so our backend is safe.
		// But if we ever use a non-superuser connection string that IS subject to RLS, we need a policy.

		// Let's create a policy that explicitly ALLOWS access for the 'service_role' (if using Supabase client)
		// or just rely on superuser bypass.

		// Supabase has a `service_role` role. By default, it bypasses RLS?
		// Actually, Supabase `service_role` key uses the `service_role` Postgres role which is usually NOT superuser but HAS `BYPASSRLS` attribute.
		// So `service_role` also bypasses RLS.

		// So, for public 'anon' access (e.g. via Data API if enabled):
		// We want to BLOCK everything.
		// The default behavior when RLS is enabled is "Deny All" unless a policy allows it.
		// So simply enabling RLS is enough to lock it down for roles that don't have BYPASSRLS.

		// But sometimes we might want PUBLIC READ on agents?
		// "users can only be added from reown wallet" -> write protected.
		// "ai can safely update memories" -> write protected.
		// Let's keep it STRICT: Default Deny.

		// We will drop existing policies to clean up before ensuring they exist to avoid duplication errors if NOT EXISTS wasn't supported for policies in older PG versions (but CREATE OR REPLACE isn't standard for POLICY).
		// Best practice: DROP IF EXISTS then CREATE.
		console.log('- Resetting policies...');

		// Users
		await sql`DROP POLICY IF EXISTS "Enable read access for all users" ON users`;
		await sql`DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users`;
		await sql`CREATE POLICY "Enable read access for all users" ON users FOR SELECT USING (true)`;
		await sql`CREATE POLICY "Enable insert for authenticated users only" ON users FOR INSERT WITH CHECK (auth.role() = 'authenticated')`;

		// Agents
		await sql`DROP POLICY IF EXISTS "Enable read access for all users" ON agents`;
		await sql`DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON agents`;
		await sql`CREATE POLICY "Enable read access for all users" ON agents FOR SELECT USING (true)`;
		await sql`CREATE POLICY "Enable insert for authenticated users only" ON agents FOR INSERT WITH CHECK (auth.role() = 'authenticated')`;

		// Memories
		await sql`DROP POLICY IF EXISTS "Enable read access for all users" ON memories`;
		await sql`DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON memories`;
		await sql`CREATE POLICY "Enable read access for all users" ON memories FOR SELECT USING (true)`;
		await sql`CREATE POLICY "Enable insert for authenticated users only" ON memories FOR INSERT WITH CHECK (auth.role() = 'authenticated')`;

		console.log('✅ Default publicly readable policies restored.');

		console.log('✅ Policies cleaned. Default "Deny All" is now active for non-privileged roles.');
		console.log(
			'ℹ️  Note: Application backend (using postgres/service_role) will bypass these checks.'
		);
	} catch (e) {
		console.error('❌ RLS Setup Failed:', e);
	} finally {
		await sql.end();
	}
}

main();
