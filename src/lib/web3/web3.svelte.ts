import { createConfig, http } from '@wagmi/core';
import { mainnet, arbitrum, baseSepolia } from '@reown/appkit/networks';
import { browser } from '$app/environment';

// Singleton State
class Web3State {
	address = $state<string | null>(null);
	chainId = $state<number | null>(null);
	isConnected = $state(false);
	error = $state<string | null>(null);
	modal: any = null;
	config: any = null;

	constructor() {
		// Init logic here
	}

	async init(projectId: string) {
		if (!browser) return;

		try {
			// Use standard import for Svelte
			const { createAppKit } = await import('@reown/appkit');
			const { WagmiAdapter } = await import('@reown/appkit-adapter-wagmi');

			const networks = [mainnet, arbitrum, baseSepolia];
			const wagmiAdapter = new WagmiAdapter({
				networks,
				projectId,
				ssr: false
			});

			this.config = wagmiAdapter.wagmiConfig;

			this.modal = createAppKit({
				adapters: [wagmiAdapter],
				networks: networks as any,
				projectId,
				metadata: {
					name: 'root0',
					description: 'Metaverse Web App',
					url: 'https://root0.online',
					icons: ['https://root0.online/icon.png']
				},
				features: {
					analytics: false
				}
			});

			// Wagmi State Subscription (This is reliable for connection status)
			this.config.subscribe(async (state: any) => {
				const newAddress = state.connections.get(state.current)?.accounts[0] || null;

				if (newAddress && newAddress !== this.address) {
					this.address = newAddress;
					// Sync user to DB
					try {
						// Extract user info from AppKit state
						// The state object structure for Reown AppKit varies, but generally user info is available
						// We might need to check specific fields like `state.user` or similar if available, or just send what we have.
						// Based on research, we might get email if social login is used.
						// Let's inspect the state object in the console for debugging,
						// and attempt to extract email/provider if possible.
						// For now we will send the whole state or relevant parts as rawData.

						// Note: actual field names for email might be in a user object or session.
						// I will try to safely access them.
						// If not directly in `state`, it might be in `this.modal.getSnapshot()` or similar.
						// Let's try to get it from `state` first as it's passed here.
						// Common structure: state.user?.email or similar.

						const userState = this.modal.getIsConnectedState(); // Check if this exists or just use state
						// Let's just use `state` passed in subscribe.

						const email = state.user?.email || state.session?.user?.email || null;
						const provider = state.provider || state.session?.peer?.metadata?.name || 'wallet';

						await fetch('/api/users/sync', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								walletAddress: newAddress,
								email,
								provider,
								rawData: state // Send full state for debugging/storage
							})
						});
						console.log('✅ User synced to Supabase:', newAddress, email);
					} catch (e) {
						console.error('❌ Failed to sync user:', e);
					}
				} else {
					this.address = newAddress;
				}

				this.chainId = state.chainId;
				this.isConnected = !!this.address;
			});
		} catch (err) {
			console.warn('Web3 Initialization Error:', err);
			this.error = 'Failed to initialize wallet. Check console (likely ad-blocker).';
		}
	}

	open() {
		if (this.modal) {
			this.modal.open();
		} else if (this.error) {
			alert(this.error);
		} else {
			console.warn('Web3 modal not initialized yet.');
		}
	}
}

export const web3 = new Web3State();
