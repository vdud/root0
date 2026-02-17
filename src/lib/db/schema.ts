import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	walletAddress: text('wallet_address').notNull().unique(),
	email: text('email'),
	provider: text('provider'),
	rawData: text('raw_data'), // storing as text to avoid complex casting, can be jsonb in DB but text in Drizzle if needed, or custom type. Let's stick to text for simplicity or jsonb if supported directly.
	// Actually schema.ts uses pg-core, let's check imports. It has `text`. Let's use `jsonb` if available or `text` and JSON.stringify.
	// Looking at the file content from view_file (step 18), it imports `pgTable, text, timestamp, uuid`. I should add `jsonb` to imports if I want to use it, or just use `text`.
	// The plan said `raw_data` (jsonb). I'll use `jsonb` and add it to imports.
	createdAt: timestamp('created_at').defaultNow(),
	lastSeen: timestamp('last_seen').defaultNow()
});

export const agents = pgTable('agents', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	purpose: text('purpose'),
	behaviour: text('behaviour'),
	owner: text('owner')
		.notNull()
		.references(() => users.walletAddress), // Link to wallet_address
	status: text('status').default('stopped'), // 'running', 'stopped'
	createdAt: timestamp('created_at').defaultNow(),
	lastSeen: timestamp('last_seen')
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export const memories = pgTable('memories', {
	id: uuid('id').primaryKey().defaultRandom(),
	agentId: uuid('agent_id')
		.notNull()
		.references(() => agents.id), // Link to agents.id
	content: text('content').notNull(),
	createdAt: timestamp('created_at').defaultNow(),
	type: text('type').default('general')
});

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
