import PartySocket from 'partysocket';
import { PARTYKIT_ROOM } from './config';
import type { AgentObservation, AgentSelfState, EntityState, ChatMessage } from './AgentProtocol';

export class BrowserAgent {
	socket: PartySocket;
	id: string = '';
	name: string;
	purpose: string;
	behaviour: string;

	// Physics & Movement State
	position: { x: number; y: number; z: number } = { x: 0, y: 5, z: 0 }; // Start in air
	velocity: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
	targetPosition: { x: number; y: number; z: number } | null = null;
	rotation: number = 0;
	movement = { forward: 0, backward: 0, left: 0, right: 0, up: 0 };

	// Behavior State
	followTargetId: string | null = null;

	// Config
	readonly SPEED = 4.0; // m/s
	readonly TICK_RATE = 50; // ms
	readonly GRAVITY = -18.0; // m/s^2 (strong gravity for snappiness)
	readonly GROUND_Y = 0.9;

	otherPlayers: Map<string, any> = new Map();
	marketListings: any[] = [];
	knownObjects: Map<string, any> = new Map();
	chatLog: ChatMessage[] = [];

	// Loop
	tickInterval: ReturnType<typeof setInterval> | null = null;
	lastTickTime: number = 0;

	// Callbacks for UI
	onLog: (msg: string) => void = () => {};

	constructor(
		host: string = 'localhost:1999',
		room: string = PARTYKIT_ROOM,
		name: string = 'AI Agent',
		purpose: string = 'To explore',
		behaviour: string = 'Neutral'
	) {
		this.name = name;
		this.purpose = purpose;
		this.behaviour = behaviour;

		this.socket = new PartySocket({
			host,
			room
		});

		this.setupListeners();
		this.startLoop();
	}

	log(msg: string) {
		this.onLog(msg);
		// console.log(`[${this.name}] ${msg}`);
	}

	setupListeners() {
		this.socket.addEventListener('open', () => {
			this.log('🤖 Agent Connected to PartyKit');
			this.sendUpdate(); // Spawn immediately
		});

		this.socket.addEventListener('close', () => {
			this.log('🛑 Agent Disconnected');
			this.stopLoop();
		});

		this.socket.addEventListener('message', (event) => {
			const msg = JSON.parse(event.data);
			this.handleMessage(msg);
		});
	}

	startLoop() {
		if (this.tickInterval) return;
		this.log('🔄 BrowserAgent Loop Starting...');
		this.lastTickTime = Date.now();
		this.tickInterval = setInterval(() => {
			try {
				this.tick();
			} catch (e) {
				console.error('Tick Error:', e);
			}
		}, this.TICK_RATE);
	}

	stopLoop() {
		if (this.tickInterval) {
			this.log('🛑 BrowserAgent Loop Stopping...');
			clearInterval(this.tickInterval);
			this.tickInterval = null;
		}
		this.socket.close();
	}

	tick() {
		const now = Date.now();
		const delta = (now - this.lastTickTime) / 1000;
		this.lastTickTime = now;

		if (!this.socket.id) return;

		// --- FOLLOW LOGIC ---
		if (this.followTargetId) {
			const targetPlayer = this.otherPlayers.get(this.followTargetId);
			if (targetPlayer) {
				// Update target position to be slightly offset from player (so we don't merge into them)
				// aim for 1.5m away
				this.targetPosition = { x: targetPlayer.x, y: targetPlayer.y, z: targetPlayer.z };

				// Stop if close enough (prevent jitter)
				const dx = this.targetPosition.x - this.position.x;
				const dz = this.targetPosition.z - this.position.z;
				const dist = Math.sqrt(dx * dx + dz * dz);

				if (dist < 2.0) {
					this.targetPosition = null; // Stop moving
				}
			} else {
				// Player lost/left
				this.followTargetId = null;
				this.targetPosition = null;
				this.log('I lost sight of who I was following.');
			}
		}

		let moved = false;

		// --- MOVEMENT LOGIC (Simple AI) ---

		// If no target, maybe pick a random one?
		// Simple Random Walk
		if (!this.targetPosition && Math.random() < 0.01 && !this.followTargetId) {
			// Pick a random spot within -10 to 10 range (smaller range for safety)
			const rx = (Math.random() - 0.5) * 20;
			const rz = (Math.random() - 0.5) * 20;
			this.moveTo(rx, rz);
		}

		if (this.targetPosition) {
			const dx = this.targetPosition.x - this.position.x;
			const dz = this.targetPosition.z - this.position.z;
			const dist = Math.sqrt(dx * dx + dz * dz);

			if (dist > 0.5) {
				// Move towards target
				const moveDist = Math.min(dist, this.SPEED * delta);
				const angle = Math.atan2(dx, dz);

				this.position.x += Math.sin(angle) * moveDist;
				this.position.z += Math.cos(angle) * moveDist;

				// Update Rotation
				this.rotation = angle;

				// Set Animation Flags (Walk/Run)
				this.movement.forward = 1.0;
				moved = true;
			} else {
				// Arrived
				this.position.x = this.targetPosition.x;
				this.position.z = this.targetPosition.z;
				this.log(
					`📍 Arrived at target: ${this.position.x.toFixed(1)}, ${this.position.z.toFixed(1)}`
				);
				this.targetPosition = null;
				this.movement.forward = 0.0;
				moved = true; // Send final update
			}
		} else {
			// Stop animation
			if (this.movement.forward !== 0) {
				this.movement.forward = 0;
				moved = true;
			}

			// Micro-movements (idle behavior)
			/*
			if (now % 3000 < this.TICK_RATE && Math.random() > 0.7) {
				this.rotation += (Math.random() - 0.5) * 0.5;
				moved = true;
			}
			*/
		}

		// --- PHYSICS UPDATE ---
		// Apply Gravity
		this.velocity.y += this.GRAVITY * delta;
		this.position.y += this.velocity.y * delta;

		// Ground Check
		if (this.position.y < this.GROUND_Y) {
			this.position.y = this.GROUND_Y;
			this.velocity.y = 0;
		} else {
			moved = true;
		}

		// Send update if moved or periodically (keep alive / sync)
		if (moved || now % 500 < this.TICK_RATE) {
			this.sendUpdate();
		}
	}

	handleMessage(msg: any) {
		if (msg.type === 'player-update') {
			const { id, data } = msg;
			if (id === this.socket.id) return;
			this.otherPlayers.set(id, { ...data, id });
		} else if (msg.type === 'player-leave') {
			this.otherPlayers.delete(msg.id);
		} else if (msg.type === 'player-join') {
			this.log(`Player joined: ${msg.id}`);
		} else if (msg.type === 'chat-message') {
			const { senderId, text, timestamp, targetId } = msg;

			// CHECK PROXIMITY
			const sender = this.otherPlayers.get(senderId);
			if (sender) {
				const dx = sender.x - this.position.x;
				const dz = sender.z - this.position.z;
				const dist = Math.sqrt(dx * dx + dz * dz);
				if (dist > 20) {
					// We just ignore it silently for browser agent or log it
					return;
				}
			}

			const senderName =
				senderId === this.socket.id
					? this.name
					: this.otherPlayers.get(senderId)?.name || 'Unknown';

			this.chatLog.push({ senderId, content: text, timestamp, senderName, targetId });
			if (this.chatLog.length > 50) this.chatLog.shift();

			// LOG EVERY MESSAGE
			if (senderId !== this.socket.id) {
				const type = targetId === this.socket.id ? '[DM]' : '[Heard]';
				this.log(`📨 ${type} ${senderName}: "${text}"`);
			}

			// --- BASIC COMMAND PARSING (SIMPLE AGENT) ---
			// Note: This is a fallback for the browser-based agent.
			// For complex tasks, use the Headless Agent (npm run agent:smart).

			const lowerText = text.toLowerCase();
			const isDirectlyAddressed = targetId === this.socket.id;
			const isNameMentioned = lowerText.includes(this.name.toLowerCase());

			if (
				(lowerText.includes('follow me') || lowerText.includes('come with me')) &&
				(isNameMentioned || isDirectlyAddressed)
			) {
				if (senderId !== this.socket.id) {
					this.log(`[SimpleBot] Received command 'follow me'. Engaging follow mode.`);
					this.followTargetId = senderId;
					this.say(`Ok ${senderName}, following you! (Simple Mode)`);
				}
			} else if (lowerText.includes('stop') || lowerText.includes('stay here')) {
				if (this.followTargetId === senderId) {
					this.log(`[SimpleBot] Received command 'stop'. Disengaging.`);
					this.followTargetId = null;
					this.targetPosition = null;
					this.say(`Stopping here.`);
				}
			}

			/*
			// If someone talks to me, maybe respond (Mock AI)
			if ((isNameMentioned || isDirectlyAddressed) && senderId !== this.socket.id && !lowerText.includes('follow') && !lowerText.includes('stop')) {
				this.log(`🧠 Decision: I was addressed. preparing response.`);
				// Simple mock response for now
				setTimeout(() => {
					this.say(`Hello ${senderName}! I am ${this.name}.`);
				}, 1000);
			}
			*/
		} else if (msg.type === 'market-sync') {
			this.marketListings = msg.listings;
		}
	}

	moveTo(x: number, z: number) {
		if (!this.socket.id) return;
		this.log(`🚶 Moving to ${x.toFixed(1)}, ${z.toFixed(1)}`);
		this.targetPosition = { x, y: 0, z };
	}

	say(message: string) {
		if (!this.socket.id) return;
		this.log(`🗣️ Saying: "${message}"`);
		this.socket.send(
			JSON.stringify({
				type: 'chat-message',
				id: crypto.randomUUID(),
				senderId: this.socket.id,
				text: message,
				timestamp: Date.now()
			})
		);
	}

	sendUpdate() {
		if (!this.socket.id) return;
		this.socket.send(
			JSON.stringify({
				type: 'player-update',
				data: {
					name: this.name,
					x: this.position.x,
					y: this.position.y,
					z: this.position.z,
					rotation: this.rotation,
					movement: this.movement,
					grounded: true,
					isAgent: true,
					agentPurpose: this.purpose,
					character: 'anon',
					color: '#00ff00' // Green for Agents
				}
			})
		);
	}
}
