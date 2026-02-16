<script lang="ts">
	import { CollisionGroups, RigidBody } from '@threlte/rapier';

	import Player from './Player/Player.svelte';

	import { isPlane } from '$lib/stores/commonStores';
	import { T } from '@threlte/core';
	import { interactivity } from '@threlte/extras';
	import NetworkPlayer from './NetworkPlayer.svelte';
	import { network } from '$lib/network/network.svelte';

	interactivity();

	import Ground from './models/Ground.svelte';
	import ProximityLoader from './ProximityLoader.svelte';

	const worldObjects = [
		// {
		// 	id: 'starting-room',
		// 	position: [0, 0, 0] as [number, number, number],
		// 	loader: () => import('./models/Starting-Room.svelte'),
		// 	priority: 10
		// },
		{
			id: 'girl-dancing-1',
			position: [-3, 0, -1] as [number, number, number],
			rotation: [0, 2, 0] as [number, number, number],
			scale: 1.2,
			loader: () => import('./models/StartingRoom Models/girl-dancing-1.svelte')
		},
		{
			id: 'girl-dancing-2',
			position: [-1, 0, 2] as [number, number, number],
			rotation: [0, 1.57, 0] as [number, number, number],
			scale: 1.1,
			loader: () => import('./models/StartingRoom Models/girl-dancing-2.svelte')
		},
		{
			id: 'car-1',
			position: [0, 0, 6] as [number, number, number],
			rotation: [0, 30, 0] as [number, number, number],
			scale: 0.15,
			loader: () => import('./models/StartingRoom Models/car-1.svelte')
		},
		{
			id: 'low-poly-ground-speaker',
			position: [3, 0, 4] as [number, number, number],
			rotation: [0, 10, 0] as [number, number, number],
			scale: 0.5,
			loader: () => import('./models/StartingRoom Models/low-poly-speakers.svelte')
		}
	];

	let { movement = $bindable() } = $props();
</script>

<T.AmbientLight intensity={0.3} />

<CollisionGroups groups={[0, 15]}>
	<RigidBody type={'fixed'}>
		<Ground />
	</RigidBody>
</CollisionGroups>

<ProximityLoader objects={worldObjects} loadRadius={25} unloadRadius={60} loadDelay={150} />

{#if $isPlane}
	<Player bind:movement />

	{#each network.otherPlayers.entries() as [id, state] (id)}
		<NetworkPlayer {state} />
	{/each}
{/if}
