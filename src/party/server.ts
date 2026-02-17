import type * as Party from 'partykit/server';

export type PlayerState = {
	id: string;
	x: number;
	y: number;
	z: number;
	rotation: number;
	animation: string;
};

export default class Server implements Party.Server {
	startTime = Date.now();
	marketListings: any[] = []; // Store active listings in memory
	worldObjects: Map<string, any> = new Map([
		[
			'girl-dancing-1',
			{
				id: 'girl-dancing-1',
				type: 'npc',
				description: 'A dancing girl avatar.',
				position: { x: 5, y: 0, z: 5 },
				radius: 1.0,
				color: 'unknown'
			}
		],
		[
			'girl-dancing-2',
			{
				id: 'girl-dancing-2',
				type: 'npc',
				description: 'Another dancing girl avatar.',
				position: { x: -2.4, y: 0, z: -8 },
				radius: 1.0,
				color: 'unknown'
			}
		],
		[
			'car-1',
			{
				id: 'car-1',
				type: 'vehicle',
				description: 'A sleek yellow sports car.',
				position: { x: 10, y: 0, z: -5 },
				radius: 2.5,
				color: 'yellow'
			}
		],
		[
			'low-poly-ground-speaker',
			{
				id: 'low-poly-ground-speaker',
				type: 'furniture',
				description: 'A large ground speaker playing music.',
				position: { x: -10, y: 0, z: -5 },
				radius: 1.5,
				color: 'black'
			}
		]
	]); // Store placed world objects

	// Track active player states for new connections
	players: Map<string, PlayerState> = new Map();

	constructor(readonly room: Party.Room) {}

	onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		// Send music sync time (elapsed since server start)
		conn.send(
			JSON.stringify({
				type: 'sync-music',
				elapsed: Date.now() - this.startTime
			})
		);

		// Send current market state to new player
		conn.send(
			JSON.stringify({
				type: 'market-sync',
				listings: this.marketListings
			})
		);

		// Send current world objects
		conn.send(
			JSON.stringify({
				type: 'object-sync',
				objects: Array.from(this.worldObjects.entries())
			})
		);

		// Send existing players to the new player (Fix for invisible bots)
		// We send a snapshot of all *other* players currently in the room
		const existingPlayers: PlayerState[] = [];
		for (const [id, state] of this.players.entries()) {
			if (id !== conn.id) {
				existingPlayers.push(state);
			}
		}

		if (existingPlayers.length > 0) {
			conn.send(
				JSON.stringify({
					type: 'player-sync',
					players: existingPlayers
				})
			);
		}

		// Notify others that a new player joined
		this.room.broadcast(
			JSON.stringify({
				type: 'player-join',
				id: conn.id
			}),
			[conn.id]
		);
	}

	onMessage(message: string, sender: Party.Connection) {
		const data = JSON.parse(message);

		// Re-broadcast updates to everyone else
		if (data.type === 'player-update') {
			// Update server-side state for new joiners
			// We trust the client's data (for now)
			// Ensure we keep the ID consistent
			const pState: PlayerState = { ...data.data, id: sender.id };
			this.players.set(sender.id, pState);

			this.room.broadcast(
				JSON.stringify({
					type: 'player-update',
					id: sender.id,
					data: data.data
				}),
				[sender.id]
			);
		} else if (data.type === 'chat-message') {
			const msg = {
				type: 'chat-message',
				id: data.id,
				senderId: sender.id,
				text: data.text,
				timestamp: Date.now(),
				targetId: data.targetId
			};

			if (data.targetId) {
				const target = this.room.getConnection(data.targetId);
				if (target) {
					target.send(JSON.stringify(msg));
				}
			} else {
				this.room.broadcast(JSON.stringify(msg), [sender.id]);
			}
		} else if (data.type === 'market-list-item') {
			// Add listing and broadcast
			this.marketListings.push(data.listing);
			this.room.broadcast(
				JSON.stringify({
					type: 'market-list-item',
					listing: data.listing
				})
			);
		} else if (data.type === 'market-buy-item') {
			// Remove listing and broadcast
			this.marketListings = this.marketListings.filter((l) => l.id !== data.listingId);
			this.room.broadcast(
				JSON.stringify({
					type: 'market-buy-item',
					listingId: data.listingId,
					buyerId: sender.id
				})
			);
		} else if (data.type === 'market-cancel-item') {
			// Remove listing and broadcast
			this.marketListings = this.marketListings.filter((l) => l.id !== data.listingId);
			this.room.broadcast(
				JSON.stringify({
					type: 'market-cancel-item',
					listingId: data.listingId
				})
			);
		} else if (data.type === 'voice-signal') {
			// Direct P2P signaling (Offer/Answer/ICE)
			// We only send this to the specific target, not broadcast
			const target = this.room.getConnection(data.targetId);
			if (target) {
				target.send(
					JSON.stringify({
						type: 'voice-signal',
						senderId: sender.id,
						signal: data.signal
					})
				);
			}
			// We do NOT broadcast 'voice-ready' here anymore.
			// That was the bug causing connection loops/resets.
			// The original 'voice-ready' broadcast should only happen
			// when a user initially joins or explicitly enables mic.
		} else if (data.type === 'object-place') {
			// console.log(`Object placed: ${data.object.id}`);
			this.worldObjects.set(data.object.id, data.object);
			this.room.broadcast(
				JSON.stringify({
					type: 'object-place',
					object: data.object
				})
			);
			// Also confirm to sender
			sender.send(
				JSON.stringify({
					type: 'object-place',
					object: data.object
				})
			);
		} else if (data.type === 'object-remove') {
			this.worldObjects.delete(data.id);
			this.room.broadcast(
				JSON.stringify({
					type: 'object-remove',
					id: data.id
				})
			);
		} else if (data.type === 'agent-debug-log') {
			// Broadcast agent logs to all clients (for dashboard)
			this.room.broadcast(
				JSON.stringify({
					type: 'agent-debug-log',
					agentId: data.agentId || sender.id,
					socketId: sender.id,
					message: data.message,
					timestamp: data.timestamp || Date.now()
				})
			);
		}
	}

	onClose(conn: Party.Connection) {
		// Remove from state tracking
		this.players.delete(conn.id);

		// Notify others that player left
		this.room.broadcast(
			JSON.stringify({
				type: 'player-leave',
				id: conn.id
			})
		);
	}
}
