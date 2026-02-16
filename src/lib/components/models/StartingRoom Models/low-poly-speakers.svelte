<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { useDraco, useGltf } from '@threlte/extras';
	import { AutoColliders } from '@threlte/rapier';
	import { playerPosition } from '$lib/stores/commonStores';
	import { Vector3 } from 'three';
	import { onMount } from 'svelte';

	let { fallback, error, children, ref = $bindable(), ...props } = $props();

	const dracoLoader = useDraco();
	const gltf = useGltf('models/world-assets/low-poly-ground-speakers-transformed.glb', {
		dracoLoader
	});

	// Speaker position (world coordinates) - adjusted to center of speaker wall
	const SPEAKER_POS = new Vector3(2, 0, -10);

	// Audio zones
	const MAX_DISTANCE = 10; // Completely silent beyond this
	const FULL_VOLUME_DIST = 2; // 100% volume within this distance

	const songs = [
		// '/speaker-songs/track-1-breadgang-like-a-bird.opus'
		// Add more songs here:
		// '/speaker-songs/track2.opus',
	];

	// Audio state
	let audio: HTMLAudioElement;
	let audioContext: AudioContext;
	let gainNode: GainNode;
	let isAudioStarted = $state(false);
	let currentGain = $state(0);
	let frameCount = 0;

	import { network } from '$lib/network/network.svelte';

	// ... (imports remain)

	export function initAudio() {
		if (isAudioStarted) return;

		audio = new Audio(songs[0]);
		audio.loop = songs.length === 1;
		audio.crossOrigin = 'anonymous';

		audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
		const source = audioContext.createMediaElementSource(audio);
		gainNode = audioContext.createGain();

		source.connect(gainNode);
		gainNode.connect(audioContext.destination);

		// Initialize at silence
		gainNode.gain.value = 0;
		currentGain = 0;

		// SYNC LOGIC
		// Wait for metadata to know duration
		audio.addEventListener(
			'loadedmetadata',
			() => {
				if (network.serverStartTime > 0 && audio.duration > 0) {
					// Time since server started, according to local clock
					const elapsed = (Date.now() - network.serverStartTime) / 1000;
					const seekTime = elapsed % audio.duration;

					audio.currentTime = seekTime;
				}
				audio.play().catch((e) => console.log('Waiting for user interaction...', e));
			},
			{ once: true }
		);

		// Trigger load
		audio.preload = 'auto'; // ensure metadata loads if not already

		audio.addEventListener('ended', () => {
			if (songs.length > 1) {
				// Cycle to next song
				const nextIndex = (songs.indexOf(audio.src.split('/').pop() || '') + 1) % songs.length;
				audio.src = songs[nextIndex];
				audio.play();
			}
		});

		isAudioStarted = true;
	}

	// Simple linear falloff - runs every frame
	useTask(() => {
		if (!audio || !isAudioStarted || !gainNode) return;

		// 1. Distance-based Volume
		const pos = $playerPosition;
		const distance = pos.distanceTo(SPEAKER_POS);

		let newGain = 0;

		if (distance <= FULL_VOLUME_DIST) {
			newGain = 1.0;
		} else if (distance >= MAX_DISTANCE) {
			newGain = 0.0;
		} else {
			// Linear: 1 at 2m, 0 at 10m
			newGain = 1 - (distance - FULL_VOLUME_DIST) / (MAX_DISTANCE - FULL_VOLUME_DIST);
		}

		// Apply gain directly (no smoothing)
		if (Math.abs(newGain - gainNode.gain.value) > 0.001) {
			gainNode.gain.value = newGain;
			currentGain = newGain;
		}

		// 2. Network Synchronization
		// Only sync if we have a valid server time and audio has duration
		// Optimization: Check only every ~60 frames (1 second) to save CPU
		if (
			frameCount++ % 60 === 0 &&
			network.serverStartTime > 0 &&
			audio.duration > 0 &&
			!audio.paused
		) {
			const elapsed = (Date.now() - network.serverStartTime) / 1000;
			// Modulo for looping track
			const expectedTime = elapsed % audio.duration;

			const drift = Math.abs(audio.currentTime - expectedTime);

			// Handle wrap-around drift (e.g. song is at 0.1s, local is at 59.9s)
			const halfDuration = audio.duration / 2;
			let wrappedDrift = drift;
			if (drift > halfDuration) {
				wrappedDrift = audio.duration - drift;
			}

			// Tolerance: 0.3s. If drift > 0.3s, snap to correct time.
			if (wrappedDrift > 0.3) {
				// Avoid "snap loops" if near the very end/start boundary
				// But mostly just force it
				console.log('🔄 Syncing audio drift:', {
					local: audio.currentTime,
					server: expectedTime,
					drift: wrappedDrift
				});
				audio.currentTime = expectedTime;
			}
		}
	});

	onMount(() => {
		const handleInteraction = () => {
			if (!isAudioStarted) initAudio();
			if (audioContext?.state === 'suspended') audioContext.resume();
		};

		window.addEventListener('click', handleInteraction, { once: true });
		window.addEventListener('keydown', handleInteraction, { once: true });

		return () => {
			window.removeEventListener('click', handleInteraction);
			window.removeEventListener('keydown', handleInteraction);
			if (audio) {
				audio.pause();
				audio.src = '';
			}
			if (audioContext) audioContext.close();
		};
	});
</script>

{#if !isAudioStarted}
	<div
		style="position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); 
              background: rgba(0,0,0,0.8); color: white; padding: 12px 24px; 
              border-radius: 8px; z-index: 1000; font-family: system-ui, sans-serif; 
              font-size: 14px; pointer-events: none; border: 1px solid rgba(255,255,255,0.2);"
	>
		🔊 Click to enable speaker audio
	</div>
{/if}

<!-- Visual debug (optional) -->
{#if isAudioStarted && currentGain > 0.01}
	<div
		style="position: fixed; bottom: 30px; right: 30px; 
              background: rgba(0,0,0,0.7); padding: 12px; border-radius: 8px; 
              z-index: 999; font-family: monospace; font-size: 11px; color: #0f0;"
	>
		<div>♪ {Math.round(currentGain * 100)}%</div>
		<div style="width: 100px; height: 4px; background: #333; margin-top: 4px; border-radius: 2px;">
			<div
				style="width: {currentGain * 100}%; height: 100%; background: #0f0; 
                  border-radius: 2px; transition: width 0.1s;"
			></div>
		</div>
	</div>
{/if}

<T.Group bind:ref dispose={false} {...props}>
	{#await gltf}
		{@render fallback?.()}
	{:then gltf}
		<AutoColliders shape="cuboid">
			<T.Mesh
				geometry={gltf.nodes.Object_4.geometry}
				material={gltf.materials.PA_speakers}
				position={[0, 0.08, 0]}
				castShadow
				receiveShadow={false}
			/>
		</AutoColliders>
	{:catch err}
		{@render error?.({ error: err })}
	{/await}

	{@render children?.({ ref })}
</T.Group>
