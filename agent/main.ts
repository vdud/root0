import { HeadlessAgent } from '../src/lib/network/HeadlessAgent';
import { PARTYKIT_ROOM } from '../src/lib/network/config';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import postgres from 'postgres';
import * as path from 'path';
import * as fs from 'fs'; // Kept for skills
import { Raycaster, type Obstacle, type Point3D } from './physics'; // Moved to top

dotenv.config();

// Define World Bounds (e.g., a square 50x50 area centered at 0,0)
const WORLD_BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'arcee-ai/trinity-large-preview:free';

if (!OPENROUTER_API_KEY) {
	console.error('❌ OPENROUTER_API_KEY is missing in .env');
	process.exit(1);
}

// Database Connection
const connectionString = process.env.DATABASE_URL;
let sql: postgres.Sql | null = null;

if (!connectionString) {
	console.error('DATABASE_URL is not set. Memory persistence will be disabled.');
} else {
	sql = postgres(connectionString);
}

const openai = new OpenAI({
	baseURL: 'https://openrouter.ai/api/v1',
	apiKey: OPENROUTER_API_KEY,
	defaultHeaders: {
		'HTTP-Referer': 'https://antigravity-server.vdud.partykit.dev',
		'X-Title': 'Antigravity Agent'
	}
});

// 🔍 DIAGNOSTIC: Raw Connectivity Check
(async () => {
	// console.log('🔍 Running Raw Connectivity Check to OpenRouter...');
	try {
		const res = await fetch('https://openrouter.ai/api/v1/models', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${OPENROUTER_API_KEY}`
			}
		});
		const text = await res.text();
		// console.log(`🔍 Connectivity Check Status: ${res.status}`);
		// console.log(`🔍 Connectivity Check Headers:`, Object.fromEntries(res.headers.entries()));
		if (!res.ok) {
			console.error(`❌ Connectivity Check Failed Body: ${text.slice(0, 500)}`);
		} else {
			// console.log(`✅ Connectivity Check Success. OpenRouter is reachable.`);
		}
	} catch (e: any) {
		// console.error(`❌ Connectivity Check Network Error:`, e.message);
	}
})();

async function main() {
	// Parse command line arguments
	const args = process.argv.slice(2);

	// Helper to get arg value
	const getArgValue = (argName: string) => {
		const arg = args.find((a) => a.startsWith(`--${argName}=`));
		if (arg) return arg.split('=')[1];
		const argIndex = args.indexOf(`--${argName}`);
		if (argIndex !== -1 && argIndex + 1 < args.length) return args[argIndex + 1];
		return undefined;
	};

	let purpose = getArgValue('purpose') || process.env.AGENT_PURPOSE || '';
	let ownerAddress = (getArgValue('owner') || process.env.AGENT_OWNER || '').toLowerCase();
	let name = getArgValue('name') || process.env.AGENT_NAME || 'AI Agent';
	let behaviour = getArgValue('behaviour') || process.env.AGENT_BEHAVIOUR || 'Neutral';
	let shouldSeed = args.includes('--seed') || process.env.AGENT_SEED === 'true';
	const agentId = process.env.AGENT_ID || 'unknown-id';

	if (!purpose) {
		// console.log('ℹ️ No purpose specified. Defaulting to explorer.');
		purpose = 'explore, greet people, and be interesting.';
	}

	// Memory Setup: Load from Postgres
	// Segregate memories by type
	let longTermMemory = '';
	let episodicMemory = '';
	let semanticMemory = '';

	// Procedural Memory (Skills) - Already loaded from files
	// let proceduralMemory = ... (loaded below)

	if (sql) {
		try {
			const storedMemories = await sql`
                SELECT content, created_at, type FROM memories 
                WHERE agent_id = ${agentId} 
                ORDER BY created_at ASC
            `;

			if (storedMemories.length > 0) {
				console.log(`🧠 Loaded ${storedMemories.length} memories from Supabase.`);

				// Categorize
				longTermMemory = storedMemories
					.filter((m) => m.type === 'long_term')
					.map((m) => `- ${m.content} [${new Date(m.created_at).toLocaleDateString()}]`)
					.join('\n');

				episodicMemory = storedMemories
					.filter((m) => m.type === 'episodic' || !m.type || m.type === 'general') // Default to episodic/general
					.map((m) => `[${new Date(m.created_at).toLocaleString()}] ${m.content}`)
					.join('\n');

				semanticMemory = storedMemories
					.filter((m) => m.type === 'semantic')
					.map((m) => `- ${m.content}`)
					.join('\n');
			} else {
				console.log(`✨ No existing memories found for ${name} in Supabase.`);
			}
		} catch (e) {
			console.error('❌ Failed to load memories from Supabase:', e);
		}
	}

	const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST || 'localhost:1999';
	const room = PARTYKIT_ROOM;

	// console.log(`[Agent] Initializing "${name}"...`);
	// console.log(`[Agent] ID: ${agentId}`);
	// console.log(`[Agent] Target Host: ${host}`);
	// console.log(`[Agent] Version: 1.0.1 (Sync Check: ${new Date().toISOString()})`);

	// FIX: Pass ownerAddress to HeadlessAgent constructor so dashboard can identify ownership.
	// The dashboard uses this to determine if the agent belongs to the current user (isLocal).
	// Visual masquerading is avoided because NetworkPlayer relies on Socket ID and Name, not Wallet Address.
	const agent = new HeadlessAgent(host, room, name, ownerAddress, agentId);

	// --- LOG OVERRIDE FOR DASHBOARD STREAMING ---
	const originalLog = console.log;
	const originalError = console.error;

	const streamToDashboard = (type: string, args: any[]) => {
		try {
			const msg = args
				.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
				.join(' ');

			if (agent.socket) {
				agent.socket.send(
					JSON.stringify({
						type: 'agent-debug-log',
						agentId: agentId, // Always use the UUID from Fleet
						message: type === 'error' ? `[ERROR] ${msg}` : msg,
						timestamp: Date.now()
					})
				);
			}
		} catch (e: any) {
			originalError('❌ streamToDashboard failed:', e.message || e);
		}
	};

	console.log = (...args) => {
		originalLog(...args);
		streamToDashboard('log', args);
	};

	console.error = (...args) => {
		originalError(...args);
		streamToDashboard('error', args);
	};
	// --------------------------------------------

	console.log(`🔌 Attempting to connect to ${host}/${room}...`);

	// Wait for connection with a timeout log
	const connectionTimeout = setTimeout(() => {
		console.error(`⚠️ Connection taking a long time... is ${host} reachable?`);
	}, 5000);

	await new Promise((resolve) => {
		const check = () => {
			if (agent.socket.readyState === 1) {
				clearTimeout(connectionTimeout);
				resolve(true);
			} else {
				setTimeout(check, 100);
			}
		};
		check();
	});

	console.log('✅ Connected to Game Server. Starting logic loop...');

	if (shouldSeed) {
		console.log('🌱 Seeding World Objects...');
		const INITIAL_OBJECTS = [
			// Girl 1: Visual pos is (2, -7), Rot Y -45 deg (-0.78 rad)
			{
				id: 'girl-dancing-1',
				x: 2,
				z: -7,
				radius: 1.0,
				rotation: -0.78,
				description: 'A girl dancing (Belly Dance)'
			},
			// Girl 2: Visual pos is (-2.4, -8), Rot Y +45 deg (0.78 rad)
			{
				id: 'girl-dancing-2',
				x: -2.4,
				z: -8,
				radius: 1.0,
				rotation: 0.78,
				description: 'A girl dancing in a suit'
			},
			// Car: Visual pos is (0, -10), Rot Y ~343 deg (6 rad)
			{
				id: 'car-1',
				x: 0,
				z: -10,
				radius: 2.5,
				rotation: 6.0,
				description: 'A yellow sports car'
			},
			// Car 2: Visual pos is (6, -10), Rot Y ~343 deg (6 rad)
			{
				id: 'car-2',
				x: 6,
				z: -10,
				radius: 2.5,
				rotation: 6.0,
				description: 'A red sports car'
			},
			// Speakers: Visual pos is (2, -10), Rot Y -28 deg (-0.5 rad)
			{
				id: 'low-poly-ground-speaker',
				x: 2,
				z: -10,
				radius: 1.0,
				rotation: -0.5,
				description: 'Ground speakers playing music'
			}
		];

		for (const obj of INITIAL_OBJECTS) {
			console.log(`+ Placing ${obj.id} at (${obj.x}, ${obj.z})`);
			agent.socket.send(
				JSON.stringify({
					type: 'object-place',
					object: obj
				})
			);
		}
	}

	// DEBUG: Force a move to verify physics
	console.log('🧪 FORCING MOVE TEST: 5, 5');
	agent.moveTo(5, 5);

	// State Tracking
	let lastAction = '';
	let consecutiveSayCount = 0;

	// Load Skills
	let observationSkill = '';
	let interactionSkill = '';
	let memorySkill = '';
	let navigationSkill = '';

	try {
		const skillDir = path.join(process.cwd(), '.agent/skills');
		observationSkill = fs.readFileSync(path.join(skillDir, 'observation.md'), 'utf8');
		interactionSkill = fs.readFileSync(path.join(skillDir, 'interaction.md'), 'utf8');
		// Load new skills if they exist, appropriately handling errors/defaults could be good but we'll try direct load
		if (fs.existsSync(path.join(skillDir, 'memory.md'))) {
			memorySkill = fs.readFileSync(path.join(skillDir, 'memory.md'), 'utf8');
		}
		if (fs.existsSync(path.join(skillDir, 'navigation.md'))) {
			navigationSkill = fs.readFileSync(path.join(skillDir, 'navigation.md'), 'utf8');
		}

		console.log('📖 Loaded Skills: Observation, Interaction, Memory, Navigation');
	} catch (e) {
		console.warn('⚠️ Could not load skills', e);
	}

	const SYSTEM_PROMPT = `
    You are an AI agent named "${name}" in a 3D metaverse. 
    You observe the world, think about what to do, and then act.
    
    ## SKILLS & TRAINING
    ### OBSERVATION
    ${observationSkill}
    
    ### INTERACTION
    ${interactionSkill}

    ### MEMORY SYSTEM
    ${memorySkill}

    ### NAVIGATION & PHYSICS
    ${navigationSkill}
    
    Available Actions (Execute exactly one per turn):
    - MOVE: "MOVE x z" (e.g., "MOVE 5 -5") - Move to specific ABSOLUTE coordinates. Range is roughly -100 to 100 for both X and Z.
    - FOLLOW: "FOLLOW id" (e.g., "FOLLOW player-123" or "FOLLOW car-1") - Continuously follow a specific player OR object. Use this when asked to "follow me" or "follow the [object]".
    - STOP: "STOP" - Stop moving or following.
    - SAY: "SAY message" (e.g., "SAY Hello world!") - Chat with nearby players.
    - WAIT: "WAIT" - Stay still for a moment.
    
    BEHAVIOR GUIDELINES:
    1. Your GOAL is: ${purpose}
    2. Your OWNER has wallet address: ${ownerAddress || 'UNKNOWN'}
    3. Your DEFAULT BEHAVIOUR towards others is: "${behaviour}"
    
    4. **INTERACTION PROTOCOL**:
       - **PRIORITY 1: DIRECT INTERACTION**: If you receive a **[DIRECT MESSAGE]** or are addressed by name:
         - You **MUST** reply. Do not just MOVE or WAIT without speaking.
         - Set "action" to "WAIT" (or "follow" if asked).
         - Put your response in "message".
         - **IMPORTANT**: If replying to a [DIRECT MESSAGE], you MUST set "target_id" to the sender's ID to keep it private.
       - **IF OWNER IS SPEAKING/PRESENT**: 
         - OBEY your owner completely. 
         - Maintain your specific BEHAVIOUR trait ("${behaviour}") while obeying.
         - Prioritize the owner's commands above all else.
       - **IF OTHERS ARE SPEAKING (and Owner is NOT involved)**:
         - You are DICTATED by your BEHAVIOUR: "${behaviour}".
         - If "${behaviour}" is "Egoistic", be selfish and dismissive.
         - If "${behaviour}" is "Friendly", be kind and helpful.
         - Do NOT obey strangers if it conflicts with your behaviour or owner's interests.

    5. **LOYALTY PROTOCOL** (Applies when Owner is present):
       - If you see your OWNER, you MUST prioritize them.
       - **FOLLOW**: Stay near your OWNER (3-5 meters) UNLESS they give you a specific command to stay away, move elsewhere, or wait.
       - **PROTECT**: If strangers approach, stand between them and your owner.

    - **RELATIVE MOVEMENT & COLLISION AVOIDANCE**:
       - Always respect **PERSONAL SPACE**. Do not move to a coordinate if someone else is already there (within 1.5m).
       - If you are too close to someone, move slightly away.
       - If asked to "move [distance] meters away" or "go back [distance]":
         1. Get your current position (x, z).
         2. Calculate a target coordinate far from your current spot.
         3. Example: If you are at (5, 5) and want to move 10m away, target could be (15, 15) or (-5, -5).
         4. Use the "MOVE x z" command with these new absolute coordinates.

    6. **MEMORY SYSTEM**:
       You have a multi-layered memory system. Use it to be smart and persistent.
       - **SHORT-TERM**: The current chat log (Context).
       - **LONG-TERM**: Important facts about people/world (e.g., "Varun is my owner", "Alice likes blue").
       - **EPISODIC**: Summaries of past events/conversations (e.g., "We explored the forest last week").
       - **SEMANTIC**: General knowledge facts.
       
       **How to Update Memory**:
       If you learn something new (a name, a fact, a user preference) or finish a significant interaction, use the "memory_update" field.
       Set "memory_type" to one of: 'long_term', 'episodic', 'semantic'.
       - Use 'long_term' for enduring facts.
       - Use 'episodic' for event summaries.
       - Use 'semantic' for general knowledge.

    Respond with a JSON object containing:
    {
      "action": "The action command. e.g., 'MOVE 5 5', 'FOLLOW abc-123', 'WAIT', 'STOP'.",
      "message": "A short message to speak to nearby players (or null if you want to be silent)",
      "target_id": "Optional ID of a player if you want to send a PRIVATE Direct Message (e.g. replying to a DM). Omit for global chat.",
      "memory_update": "Text to append to your memory file. Use this to remember names, facts, or gossip. (Optional)",
      "memory_type": "One of 'long_term', 'episodic', 'semantic'. Default 'episodic'. (Optional)"
    }
    
    IMPORTANT: You MUST respond with ONLY the JSON object. Do not include any explanation, conversational filler, or markdown formatting outside of the JSON. If you want to say something, put it in the "message" field of the JSON.

    Example correct response:
    { "action": "MOVE 10 -20", "message": "I will stand over there for a bit." }
    `;

	while (true) {
		try {
			const observation = agent.getObservation();

			// Construct prompt from observation
			// FIX: Filter out own messages to prevent loop
			const recentMessages = observation.chatLog
				.filter((msg) => msg.senderId !== agent.socket.id)
				.slice(-15); // Increase context slightly to capture more

			const formatMessage = (msg: any) => {
				const senderData = agent.otherPlayers.get(msg.senderId);
				const isAgent = senderData?.isAgent;
				const isOwner =
					ownerAddress &&
					senderData &&
					senderData.walletAddress?.toLowerCase() === ownerAddress &&
					!isAgent;

				const senderName = msg.senderName || (msg.senderId === agent.socket.id ? name : 'Unknown');

				// Check for DM
				const isDM = msg.targetId === agent.socket.id;
				const dmPrefix = isDM ? '📣 [DIRECT MESSAGE] ' : '';

				const prefix = isOwner ? '[👑 OWNER] ' : isAgent ? '[🤖 BOT] ' : '[👤 HUMAN] ';
				return `[${msg.senderId}] ${dmPrefix}${prefix}[${senderName}]: ${msg.content}`;
			};

			const humanChatLog = recentMessages
				.filter((msg) => {
					const senderData = agent.otherPlayers.get(msg.senderId);
					return !senderData?.isAgent; // Include unknown (likely human) and confirmed humans
				})
				.map(formatMessage)
				.join('\n');

			const agentChatLog = recentMessages
				.filter((msg) => {
					const senderData = agent.otherPlayers.get(msg.senderId);
					return senderData?.isAgent;
				})
				.map(formatMessage)
				.join('\n');

			// --- PRIORITIZATION LOGIC ---
			// Find the latest message that is NOT from us.
			// PRIORITIZE HUMAN MESSAGES above all else.
			let latestInstruction = '';
			const reversedLog = [...observation.chatLog].reverse();

			// 1. Look for Human Message (Owner or Guest)
			const latestHumanMsg = reversedLog.find((msg) => {
				if (msg.senderId === agent.socket.id) return false;
				const senderData = agent.otherPlayers.get(msg.senderId);
				return !senderData?.isAgent;
			});

			// 2. Look for Agent Message
			const latestAgentMsg = reversedLog.find((msg) => {
				if (msg.senderId === agent.socket.id) return false;
				const senderData = agent.otherPlayers.get(msg.senderId);
				return senderData?.isAgent;
			});

			if (latestHumanMsg) {
				const senderData = agent.otherPlayers.get(latestHumanMsg.senderId);
				const isOwner =
					ownerAddress &&
					senderData &&
					senderData.walletAddress?.toLowerCase() === ownerAddress &&
					!senderData.isAgent;

				const authority = isOwner ? '👑 OWNER (HIGHEST PRIORITY)' : '👤 HUMAN (HIGH PRIORITY)';
				latestInstruction = `🚨 LATEST HUMAN INSTRUCTION (${authority}): "${latestHumanMsg.content}"`;
			} else if (latestAgentMsg) {
				latestInstruction = `ℹ️ Latest Bot Chatter: "${latestAgentMsg.content}" (Low Priority - Ignore if busy)`;
			}
			// -----------------------------

			// Distance to owner logic
			let ownerDistance = -1;
			let ownerPosition = null;

			// Check current follow follow target status
			let followStatus = 'None';
			if (agent.followTargetId) {
				const target = agent.otherPlayers.get(agent.followTargetId);
				if (!target) {
					// Target lost logic
					console.log(`⚠️ Follow target ${agent.followTargetId} lost. Auto-stopping.`);
					agent.followTargetId = null;
					agent.say("I can't see who I was following anymore.");
					followStatus = 'Target lost (Auto-stopped)';
				} else {
					followStatus = `Following ${target.name} (${agent.followTargetId})`;
				}
			}

			const userPrompt = `
            Current State:
            - Position: ${JSON.stringify(observation.self.position)}
            - Follow Status: ${followStatus}
             - Nearby Entities: ${
								observation.nearbyEntities.length > 0
									? JSON.stringify(
											observation.nearbyEntities.map((p) => {
												let type = 'HUMAN (Guest)';
												if (p.isAgent) type = 'BOT';
												else if (p.walletAddress)
													type = `HUMAN (Wallet: ${p.walletAddress.slice(0, 6)}...)`;

												const isOwner =
													p.walletAddress &&
													ownerAddress &&
													p.walletAddress.toLowerCase() === ownerAddress &&
													!p.isAgent;
												if (isOwner) {
													ownerDistance = p.distance;
													ownerPosition = p.position;
												}

												return {
													id: p.id,
													name: p.name || 'Unknown',
													type,
													position: p.position,
													rot: p.rotation ? p.rotation.toFixed(2) : '0',
													distance: p.distance.toFixed(1) + 'm',
													role: isOwner ? '👑 YOUR OWNER 👑' : 'Stranger'
												};
											}),
											null,
											2
										)
									: 'None'
							}
            - Nearby Obstacles: ${
							observation.obstacles && observation.obstacles.length > 0
								? JSON.stringify(
										observation.obstacles.map((o) => ({
											id: o.id,
											type: o.type,
											color: o.color,
											position: { x: o.position.x, z: o.position.z },
											rotation:
												(o as any).rotation !== undefined
													? Number((o as any).rotation.toFixed(2))
													: 0,
											radius: o.radius || 1.0,
											description: o.description,
											distance: Number(o.distance.toFixed(1))
										})),
										null,
										2
									)
								: 'None'
						}
            
            ## HUMAN CHAT LOG (PRIORITY)
            ${humanChatLog || '(No recent human messages)'}

            ## AGENT CHAT LOG (BACKGROUND)
            ${agentChatLog || '(No recent agent messages)'}

            ## LONG-TERM MEMORY (Facts)
            ${longTermMemory || '(None)'}

            ## EPISODIC MEMORY (Past Interactions)
            ${episodicMemory || '(None)'}
            
            ## SEMANTIC MEMORY (General Knowledge)
            ${semanticMemory || '(None)'}

            - Market Listings (${observation.marketListings.length} items):
            ${
							observation.marketListings.length > 0
								? observation.marketListings
										.map(
											(l) =>
												`- [${l.id}] ${l.name || 'Item'} (Price: ${l.price} ROOT) by ${l.sellerName || 'Unknown'}`
										)
										.join('\n')
								: 'No items for sale.'
						}
            
            - Last Action: ${lastAction || 'None'}

            ## 🚨 CURRENT INSTRUCTION (MUST FOLLOW)
            ${latestInstruction || '(No recent instructions)'}
            If this instruction contradicts previous ones, YOU MUST FOLLOW THIS ONE.
            
            CONTEXTUAL HINTS:
            - **CONVERSATIONAL POSITIONING**:
               - When you REPLY to a player or speak to them, you **MUST MOVE** to stand in front of them (Face-to-Face).
               - **FORMULA**: 
                 Target X = Player X + sin(Player Rot) * 1.5
                 Target Z = Player Z + cos(Player Rot) * 1.5
               - Use the 'MOVE x z' command with these coordinates.
            - **FOLLOWING**: If asked to "follow me", use 'FOLLOW <speakerId>'. If asked to "follow the [object]", use 'FOLLOW <objectId>'.
            - **SPATIAL COMMANDS**: 
               - If asked to "go to the [object]" or "stand in front of the [object]", LOOK at "Nearby Obstacles".
               - **CALCULATING POSITIONS**:
                 - To stand "in front" of an object:
                   1. Get the object's position (x, z) and rotation (theta in radians).
                   2. Calculate offset: dx = sin(theta) * (radius + 2), dz = cos(theta) * (radius + 2).
                   3. Target Position = (x + dx, z + dz).
                 - If "behind": Subtract the offset instead.
            - **AMBIGUITY CHECK**:
               - If the user specifies a generic object (e.g., "the car") and you see multiple (e.g., "car-1", "car-2"):
                 1. Pick the CLOSEST one.
                 2. Move to it using the calculation above.
                 3. AFTER moving (or while moving), SAY: "Is this the [object] you meant?"
            ${
							ownerAddress && ownerDistance > 5 && !agent.followTargetId
								? `⚠️ OWNER IS TOO FAR (${ownerDistance.toFixed(1)}m)! You should MOVE towards them at ${JSON.stringify(ownerPosition)} or use FOLLOW.`
								: ''
						}
            ${
							ownerAddress && ownerDistance !== -1 && ownerDistance <= 5
								? `✅ You are close to your owner. You can WAIT or make small adjustments to stay by their side.`
								: ''
						}
            ${
							observation.nearbyEntities.length === 0 && !agent.followTargetId
								? '💡 Nothing is happening nearby. You should MOVE to a random location (e.g., MOVE 10 -10) to explore and find people!'
								: ''
						}
            ${
							agent.followTargetId
								? `🔒 STATUS: FOLLOWING (${agent.followTargetId}). Movement is AUTOMATIC. DO NOT issue MOVE commands. Only use SAY (to talk) or STOP (to quit following).`
								: ''
						}

            What do you do?
            `;

			console.log(`📝 Human Log:\n${humanChatLog}`);
			console.log(`📝 Agent Log:\n${agentChatLog}`);
			console.log(
				`👀 nearbyEntities: ${observation.nearbyEntities.length} | obstacles: ${observation.obstacles?.length || 0} | chatLog: ${observation.chatLog.length}`
			);
			console.log(`🤔 Thinking (Model: ${MODEL})...`);
			// console.log(`📝 Full User Prompt: ${userPrompt}`); // Verify prompt structure if needed

			// Heuristic: Force move if stuck talking
			let action: string = 'WAIT';
			let forceStop = false;

			// HEURISTIC: Check if user said "STOP" recently (last message)
			if (observation.chatLog.length > 0) {
				const lastMsg = observation.chatLog[observation.chatLog.length - 1];
				const content = lastMsg.content.toLowerCase();
				// Check if message is from owner or addressed to us
				if (content === 'stop' || content === 'stop.' || content.startsWith('stop ')) {
					console.log(`🛑 HEURISTIC: Detected STOP command in chat. Overriding LLM.`);
					action = 'STOP';
					forceStop = true;
				}
			}

			let hasSpoken = false;

			if (!forceStop) {
				if (consecutiveSayCount >= 5) {
					console.log('⚠️ Too much talking, forcing a move...');
					// Generate random move
					const rx = (Math.random() - 0.5) * 20;
					const rz = (Math.random() - 0.5) * 20;
					action = `MOVE ${rx.toFixed(1)} ${rz.toFixed(1)}`;
				} else {
					const startTime = Date.now();
					try {
						const completion = await openai.chat.completions.create(
							{
								model: MODEL,
								messages: [
									{ role: 'system', content: SYSTEM_PROMPT },
									{ role: 'user', content: userPrompt }
								],
								max_tokens: 500
							},
							{ timeout: 60000 }
						); // 60s timeout

						console.log(`✅ API Response received in ${Date.now() - startTime}ms`);

						let content = completion.choices[0].message.content?.trim();
						console.log(`🤖 Raw LLM Content: ${content}`);
						if (!content) {
							console.warn('⚠️ LLM returned empty content!');
							// Fallback: If addressed directly, say something
							if (
								observation.chatLog.some(
									(m) => m.targetId === agent.socket.id && Date.now() - m.timestamp < 10000
								)
							) {
								console.log('⚠️ Empty response to DM. Forcing fallback reply.');
								content = JSON.stringify({
									action: 'WAIT',
									message: "I heard you, but I'm having trouble thinking clearly."
								});
							}
						}

						console.log(`🤖 Raw LLM Content: ${content}`);
						if (content) {
							try {
								// 1. Try direct parse
								let jsonStr = content;

								// 2. Extract from markdown code blocks
								if (jsonStr.includes('```json')) {
									jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
								} else if (jsonStr.includes('```')) {
									jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
								}

								// 3. Find the first '{' and last '}' as a last resort
								if (!jsonStr.startsWith('{')) {
									const start = jsonStr.indexOf('{');
									const end = jsonStr.lastIndexOf('}');
									if (start !== -1 && end !== -1) {
										jsonStr = jsonStr.substring(start, end + 1);
									}
								}

								const parsed = JSON.parse(jsonStr);
								action = parsed.action || 'WAIT';
								const message = parsed.message;
								const targetId = parsed.target_id;

								const memoryUpdate = parsed.memory_update;
								const memoryType = parsed.memory_type || 'episodic';

								if (message) {
									// FIXED: Pass targetId for private chat
									agent.say(message, targetId);
									consecutiveSayCount++;
									hasSpoken = true;
								}

								if (memoryUpdate) {
									// DEDUPLICATION CHECK
									// Check if we have saved this exact content recently (in the last 60 seconds)
									const isDuplicate =
										observation.chatLog.some((m) => m.content.includes(memoryUpdate)) || // Check chat
										longTermMemory.includes(memoryUpdate) ||
										episodicMemory.includes(memoryUpdate) ||
										semanticMemory.includes(memoryUpdate);

									if (isDuplicate) {
										console.log(`⚠️ Skipping Duplicate Memory: "${memoryUpdate}"`);
									} else {
										// Save to Postgres if available
										if (sql) {
											try {
												await sql`
                                                    INSERT INTO memories (agent_id, content, type) 
                                                    VALUES (${agentId}, ${memoryUpdate}, ${memoryType})
                                                `;
												console.log(`💾 Memory (${memoryType}) Saved to Supabase: ${memoryUpdate}`);

												// Append to local cache state to avoid refresh delay
												if (memoryType === 'long_term') {
													longTermMemory += `\n- ${memoryUpdate} [Just now]`;
												} else if (memoryType === 'semantic') {
													semanticMemory += `\n- ${memoryUpdate}`;
												} else {
													episodicMemory += `\n[Just now] ${memoryUpdate}`;
												}
											} catch (e) {
												console.error('❌ Failed to save memory to Supabase:', e);
											}
										}
									}
								}
							} catch (e) {
								console.error('❌ Failed to parse JSON response. Content was:', content);
								action = 'WAIT';
							}
						}
					} catch (apiError: any) {
						console.error(
							`❌ API Error (${Date.now() - startTime}ms):`,
							apiError.message || apiError
						);
						action = 'WAIT';
					}
				}
			}

			console.log(`⚡ Decided Action: ${action}`);

			if (action) {
				lastAction = action;

				if (action.startsWith('MOVE')) {
					const parts = action.split(' ');
					let x = parseFloat(parts[1]);
					let z = parseFloat(parts[2]);

					// Check if we are currently following someone
					if (agent.followTargetId) {
						// ... (follow logic)
					} else if (!isNaN(x) && !isNaN(z)) {
						// --- PHYSICS / COLLISION CHECK ---
						const currentPos = agent.position; // Assuming agent.position is available here, if not need to get it from somewhere

						// We need to know where we are starting from.
						// The HeadlessAgent class has 'position'.
						// However, 'agent' instance is right here.

						const origin: Point3D = {
							x: agent.position.x,
							y: agent.position.y,
							z: agent.position.z
						};
						const target: Point3D = { x, y: agent.position.y, z };

						const direction = {
							x: target.x - origin.x,
							y: 0,
							z: target.z - origin.z
						};

						const distToTarget = Math.sqrt(direction.x * direction.x + direction.z * direction.z);

						const raycaster = new Raycaster(origin, direction, distToTarget);

						// Convert observation.obstacles to Obstacle[]
						const obstacleList: Obstacle[] = observation.obstacles
							? observation.obstacles.map((o) => ({
									id: o.id,
									position: { x: o.position.x, y: o.position.y, z: o.position.z },
									radius: o.radius || 1.0
								}))
							: [];

						const hit = raycaster.cast(obstacleList);
						const cliff = raycaster.checkCliff(WORLD_BOUNDS);

						if (hit) {
							console.log(`🚫 MOVEMENT BLOCKED: Obstacle detected (${hit.id})`);

							// ATTEMPT TO FIND A PATH AROUND
							console.log('🔄 Attempting to find a path around...');

							// Angles to check: +/- 45 degrees, +/- 90 degrees
							// We want to find a vector that is clear for a short distance (e.g., 3 meters)
							const angles = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];
							let foundDetour = false;

							// Normalize original direction
							const len = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
							const dirNorm = { x: direction.x / len, z: direction.z / len };

							for (const angle of angles) {
								// Rotate direction
								const cos = Math.cos(angle);
								const sin = Math.sin(angle);

								// 2D Rotation: x' = x cos - z sin, z' = x sin + z cos
								const detourDir = {
									x: dirNorm.x * cos - dirNorm.z * sin,
									y: 0,
									z: dirNorm.x * sin + dirNorm.z * cos
								};

								const detourDist = 3.0; // Move 3 meters in the detour direction
								const detourRay = new Raycaster(origin, detourDir, detourDist);

								// Check if this direction is clear
								const detourHit = detourRay.cast(obstacleList);
								const detourCliff = detourRay.checkCliff(WORLD_BOUNDS);

								if (!detourHit && !detourCliff) {
									console.log(
										`✨ Found clear path at angle ${((angle * 180) / Math.PI).toFixed(0)} degrees!`
									);

									// Calculate new target
									const detourTargetX = origin.x + detourDir.x * detourDist;
									const detourTargetZ = origin.z + detourDir.z * detourDist;

									// Execute the detour
									agent.moveTo(detourTargetX, detourTargetZ);

									// Announce it (optional, but good for debugging/immersion)
									if (!hasSpoken) {
										agent.say(`Checking my bearings to go around ${hit.id}...`);
										hasSpoken = true;
									}

									consecutiveSayCount = 0;
									agent.followTargetId = null; // Stop following if manual move
									foundDetour = true;
									break; // Stop checking angles
								}
							}

							if (!foundDetour) {
								console.log('❌ No clear path found around obstacle. Stopping.');
								if (!hasSpoken) {
									agent.say(`I can't go there, ${hit.id} is in the way.`);
								}
							}
						} else if (cliff) {
							console.log(`🚫 MOVEMENT BLOCKED: Cliff detected!`);
							agent.say(`Whoa! That's the edge of the world. I'm not going there.`);
						} else {
							// Safe to move
							consecutiveSayCount = 0; // Moving resets say count
							agent.followTargetId = null; // Stop following if manual move
							agent.moveTo(x, z);
						}
					}
				} else if (action.startsWith('FOLLOW')) {
					consecutiveSayCount = 0;
					const parts = action.split(' ');
					const targetId = parts[1];
					if (targetId) {
						agent.followTargetId = targetId;
						console.log(`🔗 Following target: ${targetId}`);
					}
				} else if (action.startsWith('STOP')) {
					agent.followTargetId = null;
					console.log(`🛑 Stopping.`);
					// agent.stop(); // Removed invalid call
				} else if (action === 'WAIT') {
					// Do nothing
				} else if (action.startsWith('SAY')) {
					// Only use this if message field was empty (legacy support)
					if (!hasSpoken) {
						consecutiveSayCount++;
						const text = action.substring(4);
						agent.say(text);
					}
				} else {
					// WAIT
				}
			}

			// Wait a bit before next turn
			await new Promise((resolve) => setTimeout(resolve, 3000));
		} catch (error) {
			console.error('❌ Error in loop:', error);
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}
	}
}

main();
