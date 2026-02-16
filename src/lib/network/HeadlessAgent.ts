import PartySocket from 'partysocket';
import { PARTYKIT_ROOM } from './config';
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type {
	AgentCommand,
	AgentObservation,
	AgentSelfState,
	EntityState,
	ChatMessage
} from './AgentProtocol';

// Polyfill WebSocket for Node.js
global.WebSocket = WebSocket as any;

export class HeadlessAgent {
	socket: PartySocket;
	id: string = '';
	name: string;

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
	tickInterval: NodeJS.Timeout | null = null;
	lastTickTime: number = 0;

	owner: string = '';

	constructor(
		host: string = 'localhost:1999',
		room: string = PARTYKIT_ROOM,
		name: string = 'AI Agent',
		owner: string = '',
		id: string = ''
	) {
		this.name = name;
		this.owner = owner;
		this.id = id;
		this.socket = new PartySocket({
			host,
			room,
			protocol:
				host.includes('localhost') ||
				host.includes('127.0.0.1') ||
				host.includes('host.docker.internal')
					? 'ws'
					: 'wss'
		});

		this.setupListeners();
		this.startLoop();
	}

	setupListeners() {
		this.socket.addEventListener('open', () => {
			// console.log('🤖 Agent Connected to PartyKit');
			this.sendUpdate(); // Spawn immediately
		});

		this.socket.addEventListener('close', () => {
			this.stopLoop();
		});

		this.socket.addEventListener('message', (event) => {
			const msg = JSON.parse(event.data);
			this.handleMessage(msg);
		});
	}

	startLoop() {
		if (this.tickInterval) return;
		console.error('🔄 HeadlessAgent Loop Starting...');
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
			console.error('🛑 HeadlessAgent Loop Stopping...');
			clearInterval(this.tickInterval);
			this.tickInterval = null;
		}
	}

	tick() {
		const now = Date.now();
		const delta = (now - this.lastTickTime) / 1000;
		this.lastTickTime = now;

		if (!this.socket.id) return;

		// --- FOLLOW LOGIC ---
		// --- FOLLOW LOGIC ---
		if (this.followTargetId) {
			let target = this.otherPlayers.get(this.followTargetId);
			if (!target) {
				target = this.knownObjects.get(this.followTargetId);
			}

			if (target) {
				// Normalize position (objects might not have y)
				const tx = target.x ?? target.position?.x ?? 0;
				const ty = target.y ?? target.position?.y ?? 0;
				const tz = target.z ?? target.position?.z ?? 0;

				// Update target position to be slightly offset from target
				this.targetPosition = { x: tx, y: ty, z: tz };

				// Stop if close enough (prevent jitter)
				const dx = this.targetPosition.x - this.position.x;
				const dz = this.targetPosition.z - this.position.z;
				const dist = Math.sqrt(dx * dx + dz * dz);

				if (dist < 2.0) {
					// We are close enough, but we DON'T set targetPosition to null permanently
					// because the target might move. We just don't move *this frame*.
					// Actually, our move logic below handles 'dist > 0.1'.
					// We need a way to say "don't move close", but "keep watching".

					// If we nullify targetPosition, we stop moving.
					// But we need to keep updating targetPosition every tick in case target moves.

					// So: If dist < 2.0, we just don't ACT on it in the movement block?
					// Or we set targetPosition to current position to stop?

					// Better approach: Let the movement logic handle the "stop at distance".

					// But current movement logic moves until dist < 0.1.
					// We want to stop at 2.0.

					// Let's modify targetPosition to be the edge of the 2.0m radius?

					// Simpler: If distance is < 2.0, we clear targetPosition for this tick ONLY,
					// but next tick we re-evaluate.
					this.targetPosition = null;
				}
			} else {
				// Target lost/left
				console.warn(
					`[HeadlessAgent] Follow target ${this.followTargetId} not found in players or objects.`
				);
				// We do NOT clear followTargetId immediately, maybe they are just out of range/syncing?
				// But if they are gone-gone, we might want to give up eventually.
				// For now, let's keep trying to find them.
				this.targetPosition = null;
			}
		}

		let moved = false;

		if (this.targetPosition) {
			const dx = this.targetPosition.x - this.position.x;
			const dz = this.targetPosition.z - this.position.z;
			const dist = Math.sqrt(dx * dx + dz * dz);

			if (dist > 0.1) {
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

				// DEBUG: Log movement logic
				if (now % 1000 < 60) {
					console.log(
						`[Agent Tick] Target: ${this.targetPosition.x.toFixed(2)},${this.targetPosition.z.toFixed(2)} | Dist: ${dist.toFixed(2)} | Pos: ${this.position.x.toFixed(2)},${this.position.y.toFixed(2)},${this.position.z.toFixed(2)}`
					);
				}
			} else {
				// Arrived
				this.position.z = this.targetPosition.z;
				console.log(
					`[Agent Tick] Arrived at target: ${this.position.x.toFixed(2)}, ${this.position.z.toFixed(2)}`
				);
				this.targetPosition = null;
				this.movement.forward = 0.0;
				moved = true; // Send final update to snap to exact position
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
				// Randomly rotate slightly
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
			// this.grounded = true; // (If we had a grounded state to track logic)
		} else {
			moved = true; // If falling, we are moving
		}

		// Send update if moved or periodically (keep alive / sync)
		if (moved || now % 500 < this.TICK_RATE) {
			this.sendUpdate();
		}

		// HEARTBEAT LOG (every ~2 seconds)
		if (now % 2000 < this.TICK_RATE) {
			// console.log(
			// 	`💓 Tick Heartbeat | Pos: ${this.position.x.toFixed(2)},${this.position.y.toFixed(2)},${this.position.z.toFixed(2)} | Target: ${this.targetPosition ? 'YES' : 'NO'}`
			// );
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
			// console.log(`Player joined: ${msg.id}`);
		} else if (msg.type === 'chat-message') {
			const { senderId, text, timestamp, targetId } = msg;

			// console.log(`[HeadlessAgent] 📩 Received chat-message from ${senderId}: "${text}"`);

			// CHECK PROXIMITY
			const sender = this.otherPlayers.get(senderId);
			if (sender) {
				const dx = sender.x - this.position.x;
				const dz = sender.z - this.position.z;
				const dist = Math.sqrt(dx * dx + dz * dz);
				// console.log(`[HeadlessAgent] 📏 Distance to sender ${senderId}: ${dist.toFixed(2)}m`);

				if (dist > 20) {
					// console.log(
					// 	`[HeadlessAgent] 🔇 Ignoring message from ${senderId} (too far: ${dist.toFixed(1)}m > 20m)`
					// );
					return;
				}
			} else {
				// console.log(
				// 	`[HeadlessAgent] ⚠️ Sender ${senderId} not found in otherPlayers. Accepting message anyway.`
				// );
			}

			const senderName =
				senderId === this.socket.id
					? this.name
					: this.otherPlayers.get(senderId)?.name || 'Unknown';

			// console.log(`[HeadlessAgent] ✅ Adding to chatLog: [${senderName}] ${text}`);
			this.chatLog.push({ senderId, content: text, timestamp, senderName, targetId });
			if (this.chatLog.length > 50) this.chatLog.shift();

			// --- BASIC COMMAND PARSING ---
			// Disabled: Let LLM handle commands
			/*
			const lowerText = text.toLowerCase();
			const isDirectlyAddressed = targetId === this.socket.id;
			const isNameMentioned = lowerText.includes(this.name.toLowerCase());

			if ((lowerText.includes('follow me') || lowerText.includes('come with me')) && (isNameMentioned || isDirectlyAddressed)) {
				if (senderId !== this.socket.id) {
					this.broadcastLog(`🧠 Heard "follow me" from ${senderName}${isDirectlyAddressed ? ' (DM)' : ''}. Engaging follow mode.`);
					this.followTargetId = senderId;
					this.say(`Ok ${senderName}, I'm right behind you!`);
				}
			} else if (lowerText.includes('stop') || lowerText.includes('stay here')) {
				if (this.followTargetId === senderId) {
					this.broadcastLog(`🧠 Heard "stop". Disengaging follow mode.`);
					this.followTargetId = null;
					this.targetPosition = null;
					this.say(`Stopping here.`);
				}
			}
			*/
		} else if (msg.type === 'market-sync') {
			this.marketListings = msg.listings;
		} else if (msg.type === 'market-list-item') {
			this.marketListings.push(msg.listing);
		} else if (msg.type === 'market-buy-item' || msg.type === 'market-cancel-item') {
			this.marketListings = this.marketListings.filter((l) => l.id !== msg.listingId);
		} else if (msg.type === 'object-sync') {
			this.knownObjects = new Map(msg.objects);
		} else if (msg.type === 'object-place') {
			this.knownObjects.set(msg.object.id, msg.object);
		} else if (msg.type === 'object-remove') {
			this.knownObjects.delete(msg.id);
		}
	}

	moveTo(x: number, z: number) {
		if (!this.socket.id) {
			console.warn('Cannot move, not connected yet');
			return;
		}
		this.broadcastLog(`🚶 Moving to ${x.toFixed(1)}, ${z.toFixed(1)}`);
		// Start moving towards this target in the tick loop
		this.targetPosition = { x, y: 0, z };
	}

	say(message: string) {
		if (!this.socket.id) return;
		this.broadcastLog(`🗣️ Saying: "${message}"`);
		this.socket.send(
			JSON.stringify({
				type: 'chat-message',
				id: randomUUID(),
				senderId: this.socket.id,
				text: message,
				timestamp: Date.now()
			})
		);
	}

	broadcastLog(message: string) {
		// console.log(message);
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
					character: 'anon',
					color: '#ff0000',
					metalness: 0.5,
					roughness: 0.5,
					walletAddress: this.owner
				}
			})
		);
	}

	getObservation(): AgentObservation {
		const selfState: AgentSelfState = {
			id: this.socket.id || 'connecting',
			position: this.position,
			rotation: this.rotation,
			velocity: { x: 0, y: 0, z: 0 }
		};

		const nearbyEntities: EntityState[] = Array.from(this.otherPlayers.values())
			.map((p) => {
				const dist = Math.sqrt(
					Math.pow(p.x - this.position.x, 2) + Math.pow(p.z - this.position.z, 2)
				);
				return {
					id: p.id,
					type: 'player' as const,
					position: { x: p.x, y: p.y, z: p.z },
					rotation: p.rotation || 0,
					distance: dist,
					walletAddress: p.walletAddress,
					name: p.name,
					isAgent: p.isAgent,
					isGuest: !p.walletAddress
				};
			})
			.filter((e) => e.distance < 50); // Perception range for players

		// Scan for obstacles (dynamic world objects)
		const obstacles = Array.from(this.knownObjects.values())
			.map((obs) => {
				const x = obs.position?.x ?? obs.x ?? 0;
				const z = obs.position?.z ?? obs.z ?? 0;
				const y = obs.position?.y ?? obs.y ?? 0;

				const dist = Math.sqrt(Math.pow(x - this.position.x, 2) + Math.pow(z - this.position.z, 2));
				return {
					id: obs.id, // e.g. "car-1", "tree-5"
					position: { x, y, z },
					radius: obs.radius || 1.0, // Default radius if not specified
					rotation: obs.rotation || 0, // Add rotation
					type: obs.type || 'unknown',
					color: obs.color || 'unknown',
					description: obs.description || 'Unknown object',
					distance: dist
				};
			})
			.filter((o) => o.distance < 20); // Only see obstacles within 20m

		return {
			self: selfState,
			nearbyEntities,
			chatLog: [...this.chatLog],
			marketListings: [...this.marketListings],
			obstacles,
			timestamp: Date.now()
		};
	}
}
