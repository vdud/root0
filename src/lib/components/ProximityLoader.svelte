<!-- src/lib/components/ProximityLoader.svelte -->
<script lang="ts">
	import { useTask } from '@threlte/core';
	import { T } from '@threlte/core';
	import { Vector3 } from 'three';
	import { playerPosition } from '$lib/stores/commonStores';

	interface LoadableObject {
		id: string;
		position: [number, number, number];
		loader: () => Promise<any>;
		priority?: number;
		[key: string]: any; // Allow other props like rotation, scale
	}

	const {
		objects,
		loadRadius = 30,
		unloadRadius = 60,
		loadDelay = 100
	} = $props<{
		objects: LoadableObject[];
		loadRadius?: number;
		unloadRadius?: number;
		loadDelay?: number;
	}>();

	type LoadingState = 'unloaded' | 'loading' | 'loaded' | 'error';
	type ItemState = {
		state: LoadingState;
		component?: any;
		distance: number;
		opacity?: number; // For fade-in effect
	};

	let loaded = $state<Map<string, ItemState>>(new Map());
	let loadingQueue = $state<string[]>([]);
	let isProcessing = false;

	function getDistanceSq(pos1: Vector3, pos2: [number, number, number]) {
		const dx = pos1.x - pos2[0];
		const dy = pos1.y - pos2[1];
		const dz = pos1.z - pos2[2];
		return dx * dx + dy * dy + dz * dz;
	}

	useTask((delta) => {
		const playerPos = $playerPosition;
		const loadRadiusSq = loadRadius * loadRadius;
		const unloadRadiusSq = unloadRadius ? unloadRadius * unloadRadius : Infinity;

		const toLoad: Array<{ id: string; distSq: number; priority: number }> = [];

		for (const obj of objects) {
			const distSq = getDistanceSq(playerPos, obj.position);
			const current = loaded.get(obj.id);
			const inRange = distSq <= loadRadiusSq;
			const outOfRange = distSq > unloadRadiusSq;

			// Unload if too far
			if (current && current.state === 'loaded' && outOfRange) {
				loaded.delete(obj.id);
				loaded = new Map(loaded);
				continue;
			}

			// Fade in animation
			if (
				current &&
				current.state === 'loaded' &&
				current.opacity !== undefined &&
				current.opacity < 1
			) {
				current.opacity = Math.min(1, current.opacity + delta * 3);
				loaded = new Map(loaded);
			}

			// Queue for loading
			if (inRange && !current && !loadingQueue.includes(obj.id)) {
				toLoad.push({ id: obj.id, distSq, priority: obj.priority || 0 });
			}
		}

		toLoad.sort((a, b) => {
			if (b.priority !== a.priority) return b.priority - a.priority;
			return a.distSq - b.distSq;
		});

		for (const item of toLoad) {
			loadingQueue.push(item.id);
		}

		if (!isProcessing && loadingQueue.length > 0) {
			processQueue();
		}
	});

	async function processQueue() {
		if (loadingQueue.length === 0) {
			isProcessing = false;
			return;
		}

		isProcessing = true;
		const id = loadingQueue.shift()!;
		const config = objects.find((o) => o.id === id);

		if (!config) {
			setTimeout(() => processQueue(), loadDelay);
			return;
		}

		loaded.set(id, { state: 'loading', distance: 0 });
		loaded = new Map(loaded);

		try {
			const module = await config.loader();

			loaded.set(id, {
				state: 'loaded',
				component: module.default,
				distance: 0,
				opacity: 0 // Start at 0 for fade-in
			});
			loaded = new Map(loaded);
		} catch (err) {
			console.error(`Failed to load ${id}:`, err);
			loaded.set(id, { state: 'error', distance: 0 });
			loaded = new Map(loaded);
		}

		setTimeout(() => processQueue(), loadDelay);
	}
</script>

{#each Array.from(loaded.entries()) as [id, item] (id)}
	{@const config = objects.find((o) => o.id === id)}

	{#if item.state === 'error'}
		<T.Group position={config?.position}>
			<T.Mesh>
				<T.BoxGeometry args={[1, 1, 1]} />
				<T.MeshBasicMaterial color={0xff0000} wireframe />
			</T.Mesh>
		</T.Group>
	{:else if item.state === 'loading'}
		<T.Group position={config?.position}>
			<T.Mesh>
				<T.SphereGeometry args={[0.5, 8, 8]} />
				<T.MeshBasicMaterial color={0x00ff00} wireframe transparent opacity={0.5} />
			</T.Mesh>
		</T.Group>
	{:else if item.state === 'loaded' && item.component}
		<!-- Use T.Group wrapper for opacity fade-in effect -->
		<T.Group>
			{@const { id, loader, priority, ...restProps } = config || {}}
			<svelte:component this={item.component} {...restProps} />
		</T.Group>
	{/if}
{/each}
