<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { Collider, RigidBody, CollisionGroups } from '@threlte/rapier';
	import { Text } from '@threlte/extras';
	import type * as THREE from 'three';
	import Character from './Player/Character.svelte';
	import { network, type PlayerState } from '$lib/network/network.svelte';
	import { audioListener, chatTarget, isChatOpen } from '$lib/stores/commonStores';
	import ChatBubble from './ChatBubble.svelte';

	let props = $props<{ state: PlayerState }>();

	// Interpolation logic
	let currentX = $state(props.state.x);
	let currentY = $state(props.state.y);
	let currentZ = $state(props.state.z);
	let currentRot = $state(props.state.rotation);

	function handlePlayerClick(e: any) {
		if (e && e.stopPropagation) e.stopPropagation();
		console.log('Clicked on player:', props.state.id);
		chatTarget.set(props.state.id);
		isChatOpen.set(true);
	}

	let stream = $derived.by(() => {
		return network.voiceStreams.get(props.state.id);
	});

	// Audio Reference
	let audioRef: THREE.PositionalAudio | undefined = $state();

	$effect(() => {
		if (audioRef && stream && $audioListener) {
			const tracks = stream.getAudioTracks();
			if (tracks.length > 0) {
				try {
					audioRef.setMediaStreamSource(stream);
					audioRef.setRefDistance(1);
					audioRef.setMaxDistance(25);
					audioRef.setVolume(2.0);

					if (audioRef.context.state === 'suspended') {
						audioRef.context.resume();
					}
				} catch (err) {
					console.error(`[Audio Debug] Error connecting stream:`, err);
				}
			}
		}
	});

	/*
	 * Helper Action to set srcObject on Audio Element
	 */
	function srcObject(node: HTMLAudioElement, stream: MediaStream) {
		node.srcObject = stream;
		node.play().catch((e) => console.error('Auto-play failed:', e));
		return {
			update(newStream: MediaStream) {
				if (newStream !== stream) {
					node.srcObject = newStream;
					node.play().catch((e) => console.error('Auto-play failed:', e));
				}
			}
		};
	}

	useTask((delta) => {
		const target = props.state;
		const t = Math.min(10 * delta, 1);
		currentX += (target.x - currentX) * t;
		currentY += (target.y - currentY) * t;
		currentZ += (target.z - currentZ) * t;

		// Rotation lerp (handle wrap around)
		let diff = target.rotation - currentRot;
		if (diff > Math.PI) diff -= Math.PI * 2;
		if (diff < -Math.PI) diff += Math.PI * 2;
		currentRot += diff * t;
	});
</script>

<!-- 
  We use a Kinematic RigidBody for network players so they:
  1. Have collision (can block the local player)
  2. Don't fall due to local gravity (position is controlled by server/network)
-->
<T.Group
	position={[currentX, currentY, currentZ]}
	rotation.y={currentRot}
	onclick={handlePlayerClick}
>
	{#if props.state.isAgent}
		<Text
			text={props.state.name || 'AI'}
			position={[0, 2.8, 0]}
			fontSize={0.5}
			color="white"
			anchorX="center"
			anchorY="middle"
			outlineWidth={0.02}
			outlineColor="#000000"
			billboard
		/>
	{/if}

	{#if stream && $audioListener}
		<!-- 3D Spatial Audio -->
		<T.PositionalAudio
			args={[$audioListener]}
			refDistance={1}
			maxDistance={25}
			distanceModel="linear"
			panningModel="HRTF"
			oncreate={(ref: THREE.PositionalAudio) => {
				audioRef = ref;
			}}
		/>
	{/if}

	<!-- Hack: Hidden audio element to ensure browser processes the stream -->
	{#if stream}
		<audio use:srcObject={stream} muted hidden></audio>
	{/if}

	<!-- DEBUG INDICATOR: Red = No Audio Stream, Green = Audio Stream Active -->
	<T.Mesh position={[0, 2.2, 0]}>
		<T.SphereGeometry args={[0.15]} />
		<T.MeshBasicMaterial
			color={stream && stream.getAudioTracks().length > 0 ? '#00ff00' : '#ff0000'}
		/>
	</T.Mesh>

	<ChatBubble text={props.state.lastChatMessage} timestamp={props.state.lastMessageAt} />

	<RigidBody type="kinematicPosition">
		<CollisionGroups groups={[0]}>
			<Collider shape={'capsule'} args={[0.55, 0.3]} />
		</CollisionGroups>
	</RigidBody>

	<!-- Visuals -->
	<Character
		movement={props.state.movement}
		grounded={props.state.grounded}
		character={props.state.character}
		color={props.state.color}
		metalness={props.state.metalness}
		roughness={props.state.roughness}
	/>
</T.Group>
