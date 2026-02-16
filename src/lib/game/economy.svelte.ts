import { web3 } from '$lib/web3/web3.svelte';
import { readContract, writeContract, waitForTransactionReceipt } from '@wagmi/core';
import { parseEther, formatEther } from 'viem';
import { browser } from '$app/environment';
import { network } from '$lib/network/network.svelte';

// Placeholders - User must replace these after deployment
const TOKEN_ADDRESS = '0x...';
const ITEMS_ADDRESS = '0x...';
const MARKETPLACE_ADDRESS = '0x...';

// --- Types ---
export interface Item {
	id: string;
	name: string;
	type: 'weapon' | 'armor' | 'consumable' | 'misc';
	rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
	image: string; // Emoji for now
	owner: string; // Address
}

export interface Listing {
	id: string;
	itemId: string;
	item: Item; // Embed full item details for other clients
	seller: string;
	price: string; // In ROOT
	active: boolean;
	location?: { x: number; y: number; z: number };
}

// --- ABI Fragments ---
const ERC20_ABI = [
	{
		name: 'balanceOf',
		type: 'function',
		inputs: [{ name: 'account', type: 'address' }],
		outputs: [{ name: '', type: 'uint256' }],
		stateMutability: 'view'
	},
	{
		name: 'mint',
		type: 'function',
		inputs: [
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' }
		],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		name: 'approve',
		type: 'function',
		inputs: [
			{ name: 'spender', type: 'address' },
			{ name: 'amount', type: 'uint256' }
		],
		outputs: [{ name: '', type: 'bool' }],
		stateMutability: 'nonpayable'
	}
];

class EconomyState {
	// State
	balance = $state('0');
	items = $state<Item[]>([]);
	marketListings = $state<Listing[]>([]);
	isLoading = $state(false);

	// Internal ID counters for simulation - DEPRECATED with UUIDs
	// private _nextItemId = 1;
	// private _nextListingId = 1;

	constructor() {
		if (browser) {
			this.loadFromStorage();

			// Network Listeners for Marketplace Sync
			if (typeof window !== 'undefined') {
				window.addEventListener('market-sync', (e: any) => {
					// console.log('🛒 Market Synced:', e.detail.listings);
					this.marketListings = e.detail.listings;
				});

				window.addEventListener('market-list-item', (e: any) => {
					const listing = e.detail;
					if (!this.marketListings.find((l) => l.id === listing.id)) {
						this.marketListings = [...this.marketListings, listing];
					}
				});

				window.addEventListener('market-buy-item', (e: any) => {
					const { listingId } = e.detail;
					this.marketListings = this.marketListings.filter((l) => l.id !== listingId);
				});

				window.addEventListener('market-cancel-item', (e: any) => {
					const { listingId } = e.detail;
					this.marketListings = this.marketListings.filter((l) => l.id !== listingId);
				});
			}
		}
	}

	// --- Storage Management (Simulation Mode) ---
	private loadFromStorage() {
		const storedBalance = localStorage.getItem('root0_v2_balance');
		const storedItems = localStorage.getItem('root0_v2_items');
		const storedListings = localStorage.getItem('root0_v2_listings');
		// const storedNextItemId = localStorage.getItem('root0_nextItemId');
		// const storedNextListingId = localStorage.getItem('root0_nextListingId');

		if (storedBalance) this.balance = storedBalance;
		if (storedItems) this.items = JSON.parse(storedItems);
		if (storedListings) this.marketListings = JSON.parse(storedListings);
		// if (storedNextItemId) this._nextItemId = parseInt(storedNextItemId);
		// if (storedNextListingId) this._nextListingId = parseInt(storedNextListingId);
	}

	private saveToStorage() {
		if (!browser) return;
		localStorage.setItem('root0_v2_balance', this.balance);
		localStorage.setItem('root0_v2_items', JSON.stringify(this.items));
		localStorage.setItem('root0_v2_listings', JSON.stringify(this.marketListings));
		// localStorage.setItem('root0_nextItemId', this._nextItemId.toString());
		// localStorage.setItem('root0_nextListingId', this._nextListingId.toString());
	}

	// --- Actions ---

	startListening() {
		$effect(() => {
			if (web3.isConnected && web3.address) {
				this.refresh();
			}
		});
	}

	async refresh() {
		if (!web3.isConnected || !web3.address) return;

		// Real Web3 Mode (Not fully implemented without deployed contracts)
		if (TOKEN_ADDRESS !== '0x...') {
			try {
				const balanceResult = await readContract(web3.config, {
					address: TOKEN_ADDRESS,
					abi: ERC20_ABI,
					functionName: 'balanceOf',
					args: [web3.address]
				});
				this.balance = formatEther(balanceResult as bigint);
			} catch (error) {
				console.error('Economy refresh failed:', error);
			}
		} else {
			// Simulation Mode: Load is already done in constructor, but ensuring reference
			this.loadFromStorage();
		}
	}

	async mintToken() {
		if (!web3.isConnected || !web3.address) return;
		this.isLoading = true;

		try {
			if (TOKEN_ADDRESS === '0x...') {
				// Simulation
				await new Promise((r) => setTimeout(r, 800)); // Fake delay
				const current = parseFloat(this.balance);
				this.balance = (current + 100).toString();
				this.saveToStorage();
			} else {
				// Real
				const hash = await writeContract(web3.config, {
					address: TOKEN_ADDRESS,
					abi: ERC20_ABI,
					functionName: 'mint',
					args: [web3.address, parseEther('100')]
				});
				await waitForTransactionReceipt(web3.config, { hash });
				await this.refresh();
			}
		} catch (e) {
			console.error('Mint failed', e);
		} finally {
			this.isLoading = false;
		}
	}

	async mintItem() {
		// Mints a random item
		if (!web3.isConnected || !web3.address) return;
		this.isLoading = true;

		try {
			// Simulation Only for now
			await new Promise((r) => setTimeout(r, 1000));

			const rarities: Item['rarity'][] = ['common', 'common', 'uncommon', 'rare', 'legendary'];
			const types: Item['type'][] = ['weapon', 'armor', 'consumable', 'misc'];

			const names = [
				'Plasma Blade',
				'Void Shield',
				'Health Injector',
				'Data Chip',
				'Gravity Boots',
				'Neural Link',
				'Cyber Katana',
				'Quantum Core'
			];
			const emojis = ['⚔️', '🛡️', '💊', '💾', '👢', '🧠', '🗡️', '⚛️'];

			const randIndex = Math.floor(Math.random() * names.length);
			const rarity = rarities[Math.floor(Math.random() * rarities.length)];

			const newItem: Item = {
				id: crypto.randomUUID(),
				name: names[randIndex],
				type: types[randIndex % types.length], // loose mapping
				rarity: rarity,
				image: emojis[randIndex],
				owner: web3.address
			};

			this.items = [...this.items, newItem];
			this.saveToStorage();
		} catch (e) {
			console.error('Mint Item failed', e);
		} finally {
			this.isLoading = false;
		}
	}

	async listItem(itemId: string, price: string, location?: { x: number; y: number; z: number }) {
		if (!web3.isConnected || !web3.address) return;
		this.isLoading = true;

		try {
			await new Promise((r) => setTimeout(r, 600));

			const itemIndex = this.items.findIndex((i) => i.id === itemId && i.owner === web3.address);
			if (itemIndex === -1) throw new Error('Item not found or not owned');

			// Remove from user inventory (logically, in simulation we might keep it but mark it listed,
			// but usually marketplace contract holds custody. Let's start with custody model).
			// For simplicity in this simulation, we'll keep it in 'items' but maybe filter UI?
			// Actually, let's remove from 'items' array to simulate transfer to contract.

			// Remove from inventory
			const [item] = this.items.splice(itemIndex, 1);
			this.items = [...this.items]; // trigger update

			// Add to listings
			const newListing: Listing = {
				id: crypto.randomUUID(),
				itemId: item.id,
				item: item, // Include item data
				seller: web3.address,
				price: price,
				active: true,
				location: location
			};

			// We need to store the item data somewhere if it's not in the main items list anymore...
			// In a real contract, the contract holds the NFT.
			// For simulation, let's store "Listed Items" in a separate hidden storage or attached to listing.
			// Better: Attach the item detailed data to the listing for UI.
			// But to keep it simple, we will reuse the 'items' array but change 'owner' to 'Marketplace'.
			item.owner = 'Marketplace';
			this.items = [...this.items, item]; // Add back as marketplace owned

			// Send to Network
			network.sendMarketListing(newListing);

			// Optimistic update
			this.marketListings = [...this.marketListings, newListing];
			this.saveToStorage();
		} catch (e) {
			console.error('List Item failed', e);
		} finally {
			this.isLoading = false;
		}
	}

	async buyItem(listingId: string) {
		if (!web3.isConnected || !web3.address) return;
		this.isLoading = true;

		try {
			await new Promise((r) => setTimeout(r, 800));

			const listingIndex = this.marketListings.findIndex((l) => l.id === listingId);
			if (listingIndex === -1) throw new Error('Listing not found');

			const listing = this.marketListings[listingIndex];
			const price = parseFloat(listing.price);
			const buyerBalance = parseFloat(this.balance);

			if (buyerBalance < price) {
				alert('Insufficient Funds!');
				return;
			}

			if (listing.seller === web3.address) {
				alert('You cannot buy your own item!');
				return;
			}

			// Execute Trade
			// 1. Deduct Balance
			this.balance = (buyerBalance - price).toString();

			// 2. Transfer Item
			// 2. Transfer Item
			const itemIndex = this.items.findIndex((i) => i.id === listing.itemId);
			if (itemIndex !== -1) {
				this.items[itemIndex].owner = web3.address; // Transfer ownership
				this.items = [...this.items];
			} else {
				// Buying from others: item not in my inventory, create it from listing
				if (listing.item) {
					const newItem = { ...listing.item, owner: web3.address };
					this.items = [...this.items, newItem];
				}
			}

			// 3. Remove Listing
			this.marketListings.splice(listingIndex, 1);
			this.marketListings = [...this.marketListings];

			// Network Buy
			network.sendMarketBuy(listingId);

			// 4. (Optional) Credit seller?
			// In a real local simulation, we can't easily update another user's localStorage.
			// So the seller will just lose the item and not get the money in this specific
			// local-only architecture unless we use a backend.
			// WE WILL ACCEPT THIS LIMITATION FOR NOW (Money sinks).
			// Or we can say "Marketplace Fee is 100%" :)

			this.saveToStorage();
		} catch (e) {
			console.error('Buy Item failed', e);
		} finally {
			this.isLoading = false;
		}
	}

	async cancelListing(listingId: string) {
		if (!web3.isConnected || !web3.address) return;
		this.isLoading = true;

		try {
			await new Promise((r) => setTimeout(r, 500));

			const listingIndex = this.marketListings.findIndex((l) => l.id === listingId);
			if (listingIndex === -1) throw new Error('Listing not found');

			const listing = this.marketListings[listingIndex];

			if (listing.seller.toLowerCase() !== web3.address.toLowerCase()) {
				console.error(`Seller mismatch: Listing: ${listing.seller} vs User: ${web3.address}`);
				throw new Error('Not the seller');
			}

			// Return item
			// Return item
			const itemIndex = this.items.findIndex((i) => i.id === listing.itemId);
			if (itemIndex !== -1) {
				this.items[itemIndex].owner = web3.address;
				this.items = [...this.items];
			} else {
				// Item not in local storage (maybe new session), restore from listing
				if (listing.item) {
					const returnedItem = { ...listing.item, owner: web3.address };
					this.items = [...this.items, returnedItem];
				}
			}

			// Remove Listing
			this.marketListings.splice(listingIndex, 1);
			this.marketListings = [...this.marketListings];

			// Network Cancel
			network.sendMarketCancel(listingId);

			this.saveToStorage();
		} catch (e) {
			console.error('Cancel failed', e);
		} finally {
			this.isLoading = false;
		}
	}

	// Helper to get item details for a listing
	getItemForListing(listing: Listing): Item | undefined {
		return this.items.find((i) => i.id === listing.itemId);
	}
}

export const economy = new EconomyState();
