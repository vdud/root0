import { HeadlessAgent } from '../src/lib/network/HeadlessAgent';
import { PARTYKIT_ROOM } from '../src/lib/network/config';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'arcee-ai/trinity-large-preview:free';

if (!OPENROUTER_API_KEY) {
	console.error('❌ OPENROUTER_API_KEY is missing in .env');
	process.exit(1);
}

// Log connection details for debugging
// console.log(`[Agent] Model: ${MODEL}`);
// console.log(`[Agent] Base URL: https://openrouter.ai/api/v1`);
// console.log(`[Agent] API Key: ${OPENROUTER_API_KEY.slice(0, 4)}...${OPENROUTER_API_KEY.slice(-4)}`);

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

	if (!purpose) {
		// console.log('ℹ️ No purpose specified. Defaulting to explorer.');
		purpose = 'explore, greet people, and be interesting.';
	}

	// Memory Setup
	const memoryDir = path.join(process.cwd(), '.agent/memories');
	if (!fs.existsSync(memoryDir)) {
		fs.mkdirSync(memoryDir, { recursive: true });
	}

	const memoryFile = path.join(memoryDir, `${name}.md`);
	let memory = '';
	if (fs.existsSync(memoryFile)) {
		memory = fs.readFileSync(memoryFile, 'utf8');
		// console.log(`🧠 Loaded existing memory for ${name}`);
	} else {
		// console.log(`✨ Created new memory for ${name}`);
		memory = `Memory log for ${name}. Created at ${new Date().toISOString()}
`;
		fs.writeFileSync(memoryFile, memory);
	}

	const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST || 'localhost:1999';
	const room = PARTYKIT_ROOM;
	const agentId = process.env.AGENT_ID || 'unknown-id';

	// console.log(`[Agent] Initializing "${name}"...`);
	// console.log(`[Agent] ID: ${agentId}`);
	// console.log(`[Agent] Target Host: ${host}`);
	// console.log(`[Agent] Version: 1.0.1 (Sync Check: ${new Date().toISOString()})`);

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
	try {
		observationSkill = fs.readFileSync(
			path.join(process.cwd(), '.agent/skills/observation.md'),
			'utf8'
		);
		interactionSkill = fs.readFileSync(
			path.join(process.cwd(), '.agent/skills/interaction.md'),
			'utf8'
		);
		console.log('📖 Loaded Skills: Observation & Interaction');
	} catch (e) {
		console.warn('⚠️ Could not load skills', e);
	}

	const SYSTEM_PROMPT = `
    You are an AI agent named "${name}" in a 3D metaverse. 
    You observe the world, think about what to do, and then act.
    
    ${observationSkill}
    
    ${interactionSkill}
    
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
         - Set "action" to "WAIT" (or "follow" if asked) and put your response in "message".
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

    - **RELATIVE MOVEMENT**:
       - If asked to "move [distance] meters away" or "go back [distance]":
         1. Get your current position (x, z).
         2. Calculate a target coordinate far from your current spot.
         3. Example: If you are at (5, 5) and want to move 10m away, target could be (15, 15) or (-5, -5).
         4. Use the "MOVE x z" command with these new absolute coordinates.

    7. **MEMORY & GOSSIP**:
       - You have a long-term MEMORY. Use it to store important facts about people, places, or events.
       - If you are IDLE (not obeying owner) and see another BOT, you can "GOSSIP".
       - Share something interesting from your memory or ask them for news.
       - Save any new interesting information to your memory using the "memory_update" field.

    Respond with a JSON object containing:
    {
      "action": "The action command. e.g., 'MOVE 5 5', 'FOLLOW abc-123', 'WAIT', 'STOP'.",
      "message": "A short message to speak to nearby players (or null if you want to be silent)",
      "memory_update": "Text to append to your memory file. Use this to remember names, facts, or gossip. (Optional)"
    }
    
    IMPORTANT: You MUST respond with ONLY the JSON object. Do not include any explanation, conversational filler, or markdown formatting outside of the JSON. If you want to say something, put it in the "message" field of the JSON.

    Example correct response:
    { "action": "MOVE 10 -20", "message": "I will stand over there for a bit." }
    `;

	while (true) {
		try {
			const observation = agent.getObservation();

			// Construct prompt from observation
			const formattedChatLog = observation.chatLog
				.slice(-5)
				.map((msg) => {
					// Check if sender is owner
					const isOwner =
						ownerAddress &&
						agent.otherPlayers.get(msg.senderId)?.walletAddress?.toLowerCase() === ownerAddress;

					const senderName =
						msg.senderName || (msg.senderId === agent.socket.id ? name : 'Unknown');

					// Check for DM
					const isDM = msg.targetId === agent.socket.id;
					const dmPrefix = isDM ? '📣 [DIRECT MESSAGE] ' : '';

					const prefix = isOwner ? '[👑 OWNER] ' : '';
					return `${dmPrefix}${prefix}[${senderName}]: ${msg.content}`;
				})
				.join('\n');

			// Distance to owner logic
			let ownerDistance = -1;
			let ownerPosition = null;

			// Check current follow target status
			let followStatus = 'None';
			if (agent.followTargetId) {
				const target = agent.otherPlayers.get(agent.followTargetId);
				followStatus = target
					? `Following ${target.name} (${agent.followTargetId})`
					: 'Target lost';
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
													p.walletAddress.toLowerCase() === ownerAddress;
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
            - Chat Log (Last 5 messages):
            ${formattedChatLog}

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
            
            - CURRENT MEMORY:
            ${memory}
            
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

			console.log(`📝 formattedChatLog:\n${formattedChatLog}`);
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
				if (content.includes('stop') || content.includes('stay') || content.includes('wait')) {
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
								const memoryUpdate = parsed.memory_update;

								if (message) {
									agent.say(message);
									consecutiveSayCount++;
									hasSpoken = true;
								}

								if (memoryUpdate) {
									const timestamp = new Date().toISOString();
									const entry = `\n[${timestamp}] ${memoryUpdate}`;
									memory += entry;
									fs.appendFileSync(memoryFile, entry);
									console.log(`💾 Memory Updated: ${memoryUpdate}`);
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
					const x = parseFloat(parts[1]);
					const z = parseFloat(parts[2]);

					// Check if we are currently following someone
					if (agent.followTargetId) {
						console.log(
							`⚠️ Ignoring manual MOVE command because agent is in FOLLOW mode (Target: ${agent.followTargetId}). Use STOP to break follow.`
						);
					} else if (!isNaN(x) && !isNaN(z)) {
						consecutiveSayCount = 0; // Moving resets say count
						agent.followTargetId = null; // Stop following if manual move
						agent.moveTo(x, z);
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
					agent.targetPosition = null;
					console.log(`🛑 Stopping.`);
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
