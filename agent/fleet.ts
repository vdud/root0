import express from 'express';
import cors from 'cors';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// Database Connection
const connectionString = process.env.DATABASE_URL;
let sql: postgres.Sql | null = null;

if (!connectionString) {
	console.error('DATABASE_URL is not set. Persistence will be disabled.');
} else {
	sql = postgres(connectionString);
}

interface AgentProcess {
	process: ChildProcess;
	id: string;
	name: string;
	startTime: number;
	owner: string;
}

// Store active agents in memory (for process management)
const agents = new Map<string, AgentProcess>();

// Helper to clean up dead processes
const cleanup = async (id: string, updateDB = true) => {
	if (agents.has(id)) {
		agents.delete(id);
	}
	if (updateDB && sql) {
		try {
			await sql`UPDATE agents SET status = 'stopped' WHERE id = ${id}`;
		} catch (e) {
			console.error(`[Fleet] Failed to update DB status for ${id}:`, e);
		}
	}
};

const startAgentProcess = async (
	id: string,
	name: string,
	purpose: string,
	behaviour: string,
	owner: string,
	updateDB = true
) => {
	if (agents.has(id)) {
		// console.log(`[Fleet] Agent ${name} (${id}) is already running.`);
		return;
	}

	const env = {
		...process.env,
		AGENT_ID: id,
		AGENT_NAME: name,
		AGENT_PURPOSE: purpose || 'Explorer',
		AGENT_BEHAVIOUR: behaviour || 'Neutral',
		AGENT_OWNER: owner,
		NEXT_PUBLIC_PARTYKIT_HOST: process.env.NEXT_PUBLIC_PARTYKIT_HOST || 'localhost:1999'
	};

	const tsxPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

	const child = spawn(tsxPath, ['agent/main.ts'], {
		stdio: 'inherit',
		env,
		cwd: process.cwd()
	});

	child.on('exit', (code, signal) => {
		cleanup(id, true);
	});

	child.on('error', (err) => {
		console.error(`[Fleet] Failed to start agent ${name}:`, err);
		cleanup(id, true);
	});

	agents.set(id, {
		process: child,
		id,
		name,
		startTime: Date.now(),
		owner
	});

	if (updateDB && sql) {
		try {
			// Upsert agent
			await sql`
				INSERT INTO agents (id, name, purpose, behaviour, owner, status, last_seen)
				VALUES (${id}, ${name}, ${purpose}, ${behaviour}, ${owner}, 'running', NOW())
				ON CONFLICT (id) DO UPDATE SET
					status = 'running',
					last_seen = NOW(),
					name = ${name},
					purpose = ${purpose},
					behaviour = ${behaviour},
					owner = ${owner}
			`;
		} catch (e) {
			console.error(`[Fleet] Failed to save agent ${id} to DB:`, e);
		}
	}
};

// Restore agents on startup
const restoreAgents = async () => {
	if (!sql) return;
	try {
		// console.log('[Fleet] Checking for agents to restore...');
		const agentsToRestore = await sql`SELECT * FROM agents WHERE status = 'running'`;
		// console.log(`[Fleet] Found ${agentsToRestore.length} agents to restore.`);

		for (const agent of agentsToRestore) {
			// console.log(`[Fleet] Restoring agent: ${agent.name} (${agent.id})`);
			await startAgentProcess(
				agent.id,
				agent.name,
				agent.purpose,
				agent.behaviour,
				agent.owner,
				false // Don't update DB, we are just restoring process
			);
		}
	} catch (e) {
		console.error('[Fleet] Failed to restore agents:', e);
	}
};

app.get('/agents', async (req, res) => {
	// Return list from DB if available, else memory
	if (sql) {
		try {
			const dbAgents = await sql`SELECT * FROM agents`;
			const list = dbAgents.map((a: any) => ({
				id: a.id,
				name: a.name,
				uptime: agents.has(a.id) ? Date.now() - agents.get(a.id)!.startTime : 0,
				owner: a.owner,
				purpose: a.purpose,
				behaviour: a.behaviour,
				status: agents.has(a.id) ? 'running' : 'stopped' // Sync source of truth
			}));
			res.json(list);
			return;
		} catch (e) {
			console.error('[Fleet] Failed to fetch agents from DB:', e);
		}
	}

	// Fallback to memory
	const list = Array.from(agents.values()).map((a) => ({
		id: a.id,
		name: a.name,
		uptime: Date.now() - a.startTime,
		owner: a.owner,
		// Memory agents store purpose/behaviour in env vars or we need to store them in the AgentProcess struct
		// checking the AgentProcess interface... it strictly has Process, id, name, startTime, owner.
		// We should probably update AgentProcess to store them too for fallback,
		// but for now let's just use defaults or try to fetch from somewhere if possible.
		// But wait, startAgentProcess takes them as args.
		// Let's update AgentProcess interface to include them?
		// Actually, if we are falling back to memory, it means DB is down or not connected.
		// Let's just return what we have.
		status: 'running'
	}));
	res.json(list);
});

app.post('/agent/start', async (req, res) => {
	const { id, name, purpose, behaviour, owner } = req.body;

	if (!id || !name || !owner) {
		return res.status(400).json({ error: 'Missing id, name, or owner' });
	}

	if (agents.has(id)) {
		return res.status(409).json({ error: 'Agent already running' });
	}

	await startAgentProcess(id, name, purpose, behaviour, owner, true);

	res.json({ success: true, pid: agents.get(id)?.process.pid });
});

app.post('/agent/stop', async (req, res) => {
	const { id } = req.body;

	if (!agents.has(id)) {
		// Even if not in memory, ensure DB says stopped
		if (sql) {
			await sql`UPDATE agents SET status = 'stopped' WHERE id = ${id}`;
		}
		return res.json({ success: true, message: 'Agent was not running, but status updated.' });
	}

	const agent = agents.get(id)!;
	agent.process.kill('SIGTERM');

	setTimeout(() => {
		if (agents.has(id)) {
			agent.process.kill('SIGKILL');
			cleanup(id, true);
		}
	}, 3000);

	res.json({ success: true });
});

app.listen(PORT, async () => {
	// console.log(`🚀 Agent Fleet Manager running on port ${PORT}`);
	// console.log(`[Fleet] Watching for agents...`);
	await restoreAgents();
});
