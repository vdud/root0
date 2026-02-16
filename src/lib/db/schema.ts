import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const agents = pgTable('agents', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	purpose: text('purpose'),
	behaviour: text('behaviour'),
	owner: text('owner').notNull(),
	status: text('status').default('stopped'), // 'running', 'stopped'
	createdAt: timestamp('created_at').defaultNow(),
	lastSeen: timestamp('last_seen')
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export const memories = pgTable('memories', {
	id: uuid('id').primaryKey().defaultRandom(),
	agentId: text('agent_id').notNull(),
	content: text('content').notNull(),
	createdAt: timestamp('created_at').defaultNow(),
	type: text('type').default('general')
});

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
