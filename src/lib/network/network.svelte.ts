import PartySocket from 'partysocket';
import { PARTYKIT_ROOM } from './config';

export type PlayerState = {
	id: string;
	x: number;
	y: number;
	z: number;
	rotation: number; // Y rotation
	movement: { forward: number; backward: number; left: number; right: number; up: number };
	grounded: boolean;
	character: string;
	color: string;
	metalness: number;
	roughness: number;
	isAgent?: boolean;
	name?: string;
	showChatBubble?: boolean;
	lastChatMessage?: string;
	lastMessageAt?: number;
	walletAddress?: string;
};

import type {
	AgentInterface,
	AgentCommand,
	AgentObservation,
	AgentSelfState
} from './AgentProtocol';

export class NetworkManager implements AgentInterface {
	socket: PartySocket;
	otherPlayers = $state(new Map<string, PlayerState>());
	voiceStreams = $state(new Map<string, MediaStream>());
	serverStartTime = $state(0);

	myId = $state<string>('');
	myStream: MediaStream | null = null;
	peers = new Map<string, RTCPeerConnection>();
	iceQueues = new Map<string, RTCIceCandidate[]>();

	// Agent Mode
	isAgent = $state(false);
	agentCommandCallback: ((cmd: AgentCommand) => void) | null = null;

	// Cache for self state
	myState: AgentSelfState = {
		id: '',
		position: { x: 0, y: 0, z: 0 },
		rotation: 0,
		velocity: { x: 0, y: 0, z: 0 }
	};

	// Vision State (Updated by AgentController via Raycast)
	vision = $state({
		blocked: false,
		obstacleDistance: 999
	});

	constructor() {
		// In production, you would swap localhost for your deployed PartyKit URL
		const isDev = import.meta.env.DEV;

		if (typeof window !== 'undefined') {
			const isDev = import.meta.env.DEV;
			const envHost = import.meta.env.NEXT_PUBLIC_PARTYKIT_HOST;

			// If env var is set, use it.
			// If not, in dev use localhost:1999.
			// In prod, use the gathered production host.
			const host =
				envHost || (isDev ? `${window.location.hostname}:1999` : 'root0-server.vdud.partykit.dev');
			// console.log('[NetworkManager] Connecting to PartyKit Host:', host);

			// If connecting to a remote server (not localhost), we MUST use WSS (Secure WebSocket)
			// even if we are running on HTTP localhost.
			const isSecure = window.location.protocol === 'https:';
			const protocol = isSecure ? 'wss' : isDev ? 'ws' : 'wss';

			this.socket = new PartySocket({
				host,
				room: PARTYKIT_ROOM,
				protocol
			});

			this.socket.addEventListener('open', () => {
				// Connected
			});

			this.socket.addEventListener('close', (evt) => {
				console.warn('❌ PartySocket Closed', evt);
			});

			this.socket.addEventListener('message', (event) => {
				const msg = JSON.parse(event.data);
				this.handleMessage(msg);
			});

			// Expose Agent API
			(window as any).root0 = {
				agent: this
			};
		} else {
			// Dummy socket for SSR
			this.socket = { id: 'server', send: () => {}, addEventListener: () => {} } as any;
		}
	}

	// --- Agent Interface Implementation ---
	async connect(apiKey: string): Promise<boolean> {
		// console.log('🤖 Agent connecting with key:', apiKey);
		// TODO: Validate API Key with server
		this.isAgent = true;
		return true;
	}

	disconnect(): void {
		this.isAgent = false;
		// logic to disconnect
	}

	send(command: AgentCommand): void {
		if (!this.isAgent) return;

		// Handle Chat locally first (broadcast to others via PartyKit if needed)
		if (command.type === 'chat') {
			// console.log('💬 Agent speaking:', command.payload.text);
			this.sendChatMessage(command.payload.text);
		}

		if (this.agentCommandCallback) {
			this.agentCommandCallback(command);
		}
	}

	sendChatMessage(text: string, targetId?: string) {
		if (this.socket.readyState === this.socket.OPEN) {
			this.socket.send(
				JSON.stringify({
					type: 'chat-message',
					id: crypto.randomUUID(),
					senderId: this.socket.id,
					text: text,
					timestamp: Date.now(),
					targetId
				})
			);
		}
	}

	observe(): AgentObservation {
		// Use cached state
		return {
			self: { ...this.myState, id: this.socket.id },
			nearbyEntities: Array.from(this.otherPlayers.values()).map((p) => {
				const myPos = this.myState.position;
				const dist = Math.sqrt(Math.pow(p.x - myPos.x, 2) + Math.pow(p.z - myPos.z, 2));
				return {
					id: p.id,
					type: 'player',
					position: { x: p.x, y: p.y, z: p.z },
					rotation: p.rotation || 0,
					distance: dist
				};
			}),
			chatLog: [], // Todo: Implement Chat
			vision: this.vision,
			marketListings: [], // Todo: Sync with actual listings if needed by BrowserAgent
			obstacles: [], // Todo: Sync with known objects if needed by BrowserAgent
			timestamp: Date.now()
		};
	}

	// Internal callback to link Player component to Agent commands
	registerAgentController(cb: (cmd: AgentCommand) => void) {
		this.agentCommandCallback = cb;
	}

	async setupVoice() {
		if (typeof window === 'undefined') return;
		try {
			this.myStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
			// console.log('[VoiceDebug] 🎙️ Microphone access granted.');
			this.evaluateRenegotiation();

			// If we already have peers (late join), add the track to them?
			// Actually, in this mesh flow, we usually connect on join.
			// If we join late, we wait for 'player-join' from others or initiate 'player-join' ourselves.
		} catch (e) {
			console.error('[VoiceDebug] ❌ Microphone access denied', e);
		}
	}

	handleMessage(msg: any) {
		if (msg.type === 'sync-music') {
			// Calculate local timestamp of when server started
			this.serverStartTime = Date.now() - msg.elapsed;
		} else if (msg.type === 'player-update') {
			const { id, data } = msg;
			if (id === this.socket.id) return;

			if (data.isAgent) {
				// console.log(
				// 	`[Network] 🤖 Received Agent Update for ${id} (Owner: ${data.walletAddress}) @ ${data.x?.toFixed(1)},${data.z?.toFixed(1)}`
				// );
			}

			if (!this.otherPlayers.has(id)) {
				this.otherPlayers.set(id, { ...data, id });
			} else {
				const p = this.otherPlayers.get(id);
				// FORCE REACTIVITY: Create a NEW object instead of mutating
				this.otherPlayers.set(id, { ...p, ...data });
			}
			// FORCE REACTIVITY on the Map itself (Svelte 5 Runes with Maps can be tricky)
			this.otherPlayers = new Map(this.otherPlayers);
		} else if (msg.type === 'chat-message') {
			// Incoming chat from another player (or agent)
			const { id, senderId, text } = msg; // msg structure: { type, id, senderId, text, timestamp, targetId }
			// console.log(`[NetworkManager] Chat received from ${senderId}: "${text}"`);

			// Update the sender's state to show the bubble
			if (this.otherPlayers.has(senderId)) {
				const p = this.otherPlayers.get(senderId)!;
				const updatedPlayer = {
					...p,
					lastChatMessage: text,
					lastMessageAt: Date.now(),
					showChatBubble: true
				};
				this.otherPlayers.set(senderId, updatedPlayer);

				// Force reactivity
				this.otherPlayers = new Map(this.otherPlayers);
			}

			// Dispatch event for UI to pick up (optional now, but good for 2D UI)
			window.dispatchEvent(
				new CustomEvent('player-chat', {
					detail: { senderId, text }
				})
			);
		} else if (msg.type === 'player-join') {
			// Do NOT initiate voice immediately. Wait for position update and proximity check.
			// this.createPeer(msg.id, true);
		} else if (msg.type === 'player-leave') {
			this.otherPlayers.delete(msg.id);
			this.otherPlayers = new Map(this.otherPlayers);

			// Closeup peer
			if (this.peers.has(msg.id)) {
				this.peers.get(msg.id)?.close();
				this.peers.delete(msg.id);
			}
			if (this.voiceStreams.has(msg.id)) {
				this.voiceStreams.delete(msg.id);
				this.voiceStreams = new Map(this.voiceStreams);
			}
		} else if (msg.type === 'market-list-item') {
			window.dispatchEvent(new CustomEvent('market-list-item', { detail: msg.listing }));
		} else if (msg.type === 'market-buy-item') {
			window.dispatchEvent(
				new CustomEvent('market-buy-item', {
					detail: { listingId: msg.listingId, buyerId: msg.buyerId }
				})
			);
		} else if (msg.type === 'market-cancel-item') {
			window.dispatchEvent(
				new CustomEvent('market-cancel-item', { detail: { listingId: msg.listingId } })
			);
		} else if (msg.type === 'market-sync') {
			window.dispatchEvent(new CustomEvent('market-sync', { detail: { listings: msg.listings } }));
		} else if (msg.type === 'agent-debug-log') {
			// Broadcast agent logs to all clients (for dashboard)
			window.dispatchEvent(
				new CustomEvent('agent-debug-log', {
					detail: {
						agentId: msg.agentId,
						socketId: msg.socketId,
						message: msg.message,
						timestamp: msg.timestamp
					}
				})
			);
		} else if (msg.type === 'voice-signal') {
			this.handleSignal(msg.senderId, msg.signal);
		} else if (msg.type === 'voice-ready') {
			// Only connect if within range
			const p = this.otherPlayers.get(msg.id);
			if (p) {
				const myPos = this.myState.position;
				const dist = Math.sqrt(Math.pow(p.x - myPos.x, 2) + Math.pow(p.z - myPos.z, 2));

				if (dist <= this.VOICE_CONNECT_DISTANCE) {
					// Always clean up existing connection to ensure fresh start
					if (this.peers.has(msg.id)) {
						this.peers.get(msg.id)?.close();
						this.peers.delete(msg.id);
					}

					// Deterministic Initiation: Only one side initiates the rebuild (The one with larger ID)
					if (this.socket.id > msg.id) {
						this.createPeer(msg.id, true);
					}
				}
			}
		}
	}

	// Proximity Voice Chat Settings
	readonly VOICE_CONNECT_DISTANCE = 20; // meters (Join here)
	readonly VOICE_DISCONNECT_DISTANCE = 25; // meters (Leave here - Hysteresis)
	readonly PROXIMITY_CHECK_INTERVAL = 1000; // ms
	lastProximityCheck = 0;

	sendUpdate(data: Omit<PlayerState, 'id'>) {
		if (this.socket.readyState !== this.socket.OPEN) return;
		this.socket.send(
			JSON.stringify({
				type: 'player-update',
				data
			})
		);

		// Update local cache
		this.myState = {
			id: this.socket.id,
			position: { x: data.x, y: data.y, z: data.z },
			rotation: data.rotation,
			velocity: { x: 0, y: 0, z: 0 }
		};

		// Run proximity check periodically
		const now = Date.now();
		if (now - this.lastProximityCheck > this.PROXIMITY_CHECK_INTERVAL) {
			this.checkVoiceProximity();
			this.lastProximityCheck = now;
		}
	}

	checkVoiceProximity() {
		const myPos = this.myState.position;

		this.otherPlayers.forEach((player) => {
			const dist = Math.sqrt(
				Math.pow(player.x - myPos.x, 2) +
					Math.pow(player.y - myPos.y, 2) +
					Math.pow(player.z - myPos.z, 2)
			);

			// Logic:
			// If connected: Check if > DISCONNECT_DISTANCE
			// If not connected: Check if < CONNECT_DISTANCE

			if (this.peers.has(player.id)) {
				// We are currently connected
				if (dist > this.VOICE_DISCONNECT_DISTANCE) {
					console.log(
						`[VoiceDebug] 🔇 ${player.id} LEFT range (${dist.toFixed(1)}m > ${this.VOICE_DISCONNECT_DISTANCE}m). Disconnecting...`
					);
					this.cleanupPeer(player.id);
				}
			} else {
				// We are NOT connected
				if (dist <= this.VOICE_CONNECT_DISTANCE) {
					// Connect if we are the dominant ID (to avoid glare/collision)
					if (this.socket.id > player.id) {
						console.log(
							`[VoiceDebug] 🔊 ${player.id} ENTERED range (${dist.toFixed(1)}m <= ${this.VOICE_CONNECT_DISTANCE}m). Initiating Connection...`
						);
						this.createPeer(player.id, true);
					} else {
						// We wait for them to connect to us
						console.log(
							`[VoiceDebug] ⏳ ${player.id} in range (${dist.toFixed(1)}m). Waiting for offer...`
						);
					}
				}
			}
		});
	}

	cleanupPeer(targetId: string) {
		console.log(`[VoiceDebug] 🧹 Cleaning up peer ${targetId}`);
		if (this.peers.has(targetId)) {
			this.peers.get(targetId)?.close();
			this.peers.delete(targetId);
		}
		if (this.voiceStreams.has(targetId)) {
			const stream = this.voiceStreams.get(targetId);
			if (stream) {
				stream.getTracks().forEach((track) => {
					console.log(`[VoiceDebug] 🛑 Stopping track for ${targetId}:`, track.kind);
					track.stop();
				});
			}
			this.voiceStreams.delete(targetId);
			// Force reactivity update
			this.voiceStreams = new Map(this.voiceStreams);
		}
		if (this.iceQueues.has(targetId)) {
			this.iceQueues.delete(targetId);
		}
	}

	sendVoiceReady() {
		// No-op for proximity version?
		// Actually we still need this for the initial 'mic readiness',
		// but the proximity check usually handles the connection creation.
		// We can leave it, but maybe guard it?
		if (this.socket.readyState !== this.socket.OPEN) return;
		// this.socket.send(JSON.stringify({ type: 'voice-ready' }));
		// ^ Disable global broadcast of voice-ready to prevent mass-connections.
		// Proximity loop handles it.
	}

	// Call this when we get a mic or change tracks
	evaluateRenegotiation() {
		// 1. Add tracks to all existing peers
		this.peers.forEach((pc, peerId) => {
			if (this.myStream) {
				const audioTracks = this.myStream.getAudioTracks();
				if (audioTracks.length > 0) {
					// Check if track already exists
					const senders = pc.getSenders();
					const hasTrack = senders.some((s) => s.track?.id === audioTracks[0].id);

					if (!hasTrack) {
						console.log(`[VoiceDebug] 🎙️ Adding late track to peer ${peerId}`);
						audioTracks.forEach((track) => pc.addTrack(track, this.myStream!));

						// Renegotiate (Create Offer)
						pc.createOffer().then((offer) => {
							pc.setLocalDescription(offer);
							this.sendSignal(peerId, { sdp: offer });
						});
					}
				}
			}
		});

		// 2. Trigger proximity check for new connections
		this.checkVoiceProximity();
	}

	// WebRTC Mesh Logic
	createPeer(targetId: string, initiator: boolean) {
		if (this.peers.has(targetId)) return;
		// if (!this.myStream) return; // Allow Receive-Only if mic not ready yet

		console.log(`[VoiceDebug] 🆕 Creating Peer for ${targetId} (Initiator: ${initiator})`);

		const pc = new RTCPeerConnection({
			iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
		});

		// Monitor connection state
		pc.onconnectionstatechange = () => {
			const state = pc.connectionState;
			console.log(`[VoiceDebug] 📡 Peer ${targetId} connection state:`, state);
			if (state === 'failed' || state === 'disconnected' || state === 'closed') {
				// Peer died. Attempt restart if we are the initiator or if it stays dead.
				// Simple strategy: Just try to restart after a delay.
				setTimeout(() => {
					if (this.peers.has(targetId) && this.peers.get(targetId)?.connectionState === state) {
						console.warn(`🔄 Restarting peer connection to ${targetId}...`);
						this.restartPeer(targetId);
					}
				}, 2000);
			}
		};

		pc.oniceconnectionstatechange = () => {
			const state = pc.iceConnectionState;
			console.log(`[VoiceDebug] ❄️ Peer ${targetId} ICE state:`, state);
			if (state === 'failed' || state === 'disconnected') {
				// ICE failed.
				setTimeout(() => {
					if (this.peers.has(targetId) && this.peers.get(targetId)?.iceConnectionState === state) {
						console.warn(`❄️🔄 Restarting peer ICE to ${targetId}...`);
						this.restartPeer(targetId);
					}
				}, 2000);
			}
		};

		// Add my mic track if available
		if (this.myStream) {
			this.myStream.getTracks().forEach((track) => {
				console.log(`[VoiceDebug] ➕ Adding local track to ${targetId}`);
				pc.addTrack(track, this.myStream!);
			});
		}

		// Handle incoming tracks
		pc.ontrack = (event) => {
			console.log(`[VoiceDebug] 👂 Received track from ${targetId}:`, event.streams[0].id);
			this.voiceStreams.set(targetId, event.streams[0]);
			this.voiceStreams = new Map(this.voiceStreams);
		};

		// Handle ICE candidates
		pc.onicecandidate = (event) => {
			if (event.candidate) {
				this.sendSignal(targetId, { ice: event.candidate });
			}
		};

		// Create Offer if initiator
		if (initiator) {
			pc.createOffer().then((offer) => {
				pc.setLocalDescription(offer);
				this.sendSignal(targetId, { sdp: offer });
			});
		}

		this.peers.set(targetId, pc);
	}

	async handleSignal(senderId: string, signal: any) {
		// If we receive a signal from someone we don't have a peer for, create it (as non-initiator)
		if (!this.peers.has(senderId)) {
			// If we get an answer but don't have a peer, it's a zombie signal (ignore it)
			if (signal.sdp && signal.sdp.type === 'answer') {
				console.warn(`Ignoring zombie answer from ${senderId}`);
				return;
			}
			console.log(`[VoiceDebug] 📨 Received signal from unknown peer ${senderId}. Creating...`);
			this.createPeer(senderId, false);
		}

		const pc = this.peers.get(senderId)!;

		try {
			if (signal.sdp) {
				// Prevent loop: If we are 'stable' and receive an 'answer', it's redundant/error
				if (pc.signalingState === 'stable' && signal.sdp.type === 'answer') {
					console.warn(`Ignoring answer from ${senderId} because signalingState is stable.`);
					return;
				}

				// If we receive an 'offer' but we are not 'stable', we might be in a glare (collision).
				// Simple conflict resolution: if we are trying to offer too, but they have higher ID, let them win?
				// For now, let's just proceed and let WebRTC roll-back if needed.

				await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
				console.log(`[VoiceDebug] ✅ Set Remote Description (${signal.sdp.type}) for ${senderId}`);

				// FLUSH ICE QUEUE
				if (this.iceQueues.has(senderId)) {
					const queue = this.iceQueues.get(senderId)!;
					console.log(`[VoiceDebug] 🧊 Flushing ${queue.length} ICE candidates for ${senderId}`);
					for (const candidate of queue) {
						await pc.addIceCandidate(candidate);
					}
					this.iceQueues.delete(senderId);
				}

				// Ensure we attach our mic tracks if we have them but haven't added them to this PC yet
				if (this.myStream) {
					const senders = pc.getSenders();
					if (senders.length === 0) {
						console.log(`[VoiceDebug] ➕ Adding local track to ${senderId} (response)`);
						this.myStream.getTracks().forEach((track) => pc.addTrack(track, this.myStream!));
					}
				}

				if (signal.sdp.type === 'offer') {
					const answer = await pc.createAnswer();
					await pc.setLocalDescription(answer);
					this.sendSignal(senderId, { sdp: answer });
				}
			} else if (signal.ice) {
				// ICE candidate buffering: Only add if remote description is set
				if (pc.remoteDescription) {
					await pc.addIceCandidate(new RTCIceCandidate(signal.ice));
				} else {
					console.warn(
						`[VoiceDebug] 🧊 Buffering ICE from ${senderId} because remoteDescription is null`
					);
					if (!this.iceQueues.has(senderId)) {
						this.iceQueues.set(senderId, []);
					}
					this.iceQueues.get(senderId)!.push(new RTCIceCandidate(signal.ice));
				}
			}
		} catch (e) {
			console.error(`Error handling signal from ${senderId}:`, e);
		}
	}

	sendSignal(targetId: string, signal: any) {
		this.socket.send(
			JSON.stringify({
				type: 'voice-signal',
				targetId,
				signal
			})
		);
	}

	// --- Marketplace Network Methods ---
	sendMarketListing(listing: any) {
		if (this.socket.readyState !== this.socket.OPEN) return;
		this.socket.send(
			JSON.stringify({
				type: 'market-list-item',
				listing
			})
		);
	}

	sendMarketBuy(listingId: string) {
		if (!this.socket) return;
		this.socket.send(
			JSON.stringify({
				type: 'market-buy-item',
				listingId
			})
		);
	}

	sendMarketCancel(listingId: string) {
		if (!this.socket) return;
		this.socket.send(
			JSON.stringify({
				type: 'market-cancel-item',
				listingId
			})
		);
	}

	restartPeer(targetId: string) {
		// Cleanup old peer
		if (this.peers.has(targetId)) {
			this.peers.get(targetId)?.close();
			this.peers.delete(targetId);
		}

		// Validation: Is the peer still in our known players list?
		if (!this.otherPlayers.has(targetId)) {
			console.warn(`[VoiceDebug] 🛑 Cannot restart peer ${targetId}: Player not found.`);
			return;
		}

		// Validation: Is the peer still in range?
		const p = this.otherPlayers.get(targetId);
		if (p) {
			const myPos = this.myState.position;
			const dist = Math.sqrt(Math.pow(p.x - myPos.x, 2) + Math.pow(p.z - myPos.z, 2));
			if (dist > this.VOICE_CONNECT_DISTANCE) {
				console.warn(
					`[VoiceDebug] 🛑 Cannot restart peer ${targetId}: Out of range (${dist.toFixed(1)}m).`
				);
				return;
			}
		}

		// Initiate new connection - force initiator to be true to jumpstart the process
		// But wait -- if we both restart at same time, we might collide.
		// stick to ID rule?
		if (this.socket.id > targetId) {
			this.createPeer(targetId, true);
		} else {
			// If we are the passive side, send 'voice-ready' to prompt them
			this.socket.send(
				JSON.stringify({
					type: 'voice-ready',
					id: this.socket.id
				})
			);
		}
	}
}

export const network = new NetworkManager();
