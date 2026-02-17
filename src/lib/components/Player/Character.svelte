<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { useDraco, useGltf } from '@threlte/extras';
	import { AnimationMixer, LoopRepeat, LoopOnce } from 'three';
	import type { Mesh } from 'three';
	import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

	import { MeshStandardMaterial } from 'three';
	import type { Material } from 'three';

	interface Props {
		movement: { forward: number; backward: number; left: number; right: number; up: number };
		grounded?: boolean;
		character?: string;
		color?: string;
		metalness?: number;
		roughness?: number;
	}

	let {
		movement,
		grounded = true,
		character = 'anon',
		color = '#ffffff',
		metalness = 0.5,
		roughness = 0.5
	}: Props = $props();

	// ... (mixer state)

	let mixer = $state<AnimationMixer | null>(null);
	let isReady = $state(false);

	type AnimState = 'idle' | 'walk' | 'run' | 'jumpStart' | 'jumpMid' | 'jumpEnd';
	type JumpPhase = 'takeoff' | 'hang' | 'landing' | 'landing_pending' | 'none';

	let currentState = $state<AnimState>('idle');
	let jumpPhase = $state<JumpPhase>('none');
	let wasGrounded = $state(true);
	let jumpPressed = $state(false);

	const actions = $state<Partial<Record<AnimState, any>>>({});

	// Rotation state
	let currentRotation = $state(0);
	let targetRotation = $state(0);
	const ROTATION_SPEED = 8;

	const dracoLoader = useDraco();

	// Dynamic position based on character model (Adjusted for Anon)
	const characterPosition = [0, -0.9, 0] as const;

	// Always load Anon
	const charGltf = useGltf('/models/Characters/anon-transformed.glb', { dracoLoader });

	// Clone the scene for this instance using SkeletonUtils
	// This ensures each player has their own SkinnedMesh and Skeleton
	const scene = $derived($charGltf ? SkeletonUtils.clone($charGltf.scene) : undefined);

	// Movement animations
	const idleGltf = useGltf('/models/Animations/idle-transformed.glb', { dracoLoader });
	const runGltf = useGltf('/models/Animations/run-transformed.glb', { dracoLoader });
	const walkingGltf = useGltf('/models/Animations/walking-transformed.glb', { dracoLoader });

	// Three-part jump animations
	const jumpStartGltf = useGltf('/models/Animations/jump-start-transformed.glb', { dracoLoader });
	const jumpMidGltf = useGltf('/models/Animations/jump-mid-transformed.glb', { dracoLoader });
	const jumpEndGltf = useGltf('/models/Animations/jump-end-transformed.glb', { dracoLoader });

	function getGroundState(): AnimState {
		const moveAmount = Math.max(movement.forward, movement.backward, movement.left, movement.right);
		if (moveAmount > 0.7) return 'run';
		if (moveAmount > 0.1) return 'walk';
		return 'idle';
	}

	function switchTo(target: AnimState) {
		if (!isReady || !mixer) return;
		if (currentState === target) return;

		const prevAction = actions[currentState];
		const nextAction = actions[target];

		if (!nextAction) {
			console.warn('Animation not loaded:', target);
			return;
		}

		if (prevAction) {
			prevAction.fadeOut(0.15);
		}

		nextAction.reset().fadeIn(0.15).play();
		currentState = target;
	}

	// Reactive initialization
	$effect(() => {
		const characterMesh = scene; // Use the derived scene we are rendering
		const idle = $idleGltf;
		const run = $runGltf;
		const walk = $walkingGltf;
		const jumpStart = $jumpStartGltf;
		const jumpMid = $jumpMidGltf;
		const jumpEnd = $jumpEndGltf;

		if (
			!characterMesh ||
			!idle?.animations?.[0] ||
			!run?.animations?.[0] ||
			!walk?.animations?.[0] ||
			!jumpStart?.animations?.[0] ||
			!jumpMid?.animations?.[0] ||
			!jumpEnd?.animations?.[0]
		) {
			isReady = false;
			return;
		}

		// Cleanup old mixer if it exists
		if (mixer) {
			mixer.stopAllAction();
		}

		const newMixer = new AnimationMixer(characterMesh);

		actions.idle = newMixer.clipAction(idle.animations[0]);
		actions.idle.setLoop(LoopRepeat, Infinity);

		actions.run = newMixer.clipAction(run.animations[0]);
		actions.run.setLoop(LoopRepeat, Infinity);

		actions.walk = newMixer.clipAction(walk.animations[0]);
		actions.walk.setLoop(LoopRepeat, Infinity);

		actions.jumpStart = newMixer.clipAction(jumpStart.animations[0]);
		actions.jumpStart.setLoop(LoopOnce, 1);
		actions.jumpStart.clampWhenFinished = true;

		actions.jumpMid = newMixer.clipAction(jumpMid.animations[0]);
		actions.jumpMid.setLoop(LoopOnce, 1);
		actions.jumpMid.clampWhenFinished = false;

		actions.jumpEnd = newMixer.clipAction(jumpEnd.animations[0]);
		actions.jumpEnd.setLoop(LoopOnce, 1);
		actions.jumpEnd.clampWhenFinished = true;

		newMixer.addEventListener('finished', (e) => {
			// We need to access the *current* state of actions here, which is fine as they are in the closure/module scope,
			// but we stored them in the `actions` object which is stable.
			if (e.action === actions.jumpStart && jumpPhase === 'takeoff') {
				jumpPhase = 'hang';
				if (actions.jumpMid) {
					actions.jumpMid.timeScale = 1;
					actions.jumpMid.time = 0;
				}
				switchTo('jumpMid');
			} else if (e.action === actions.jumpEnd && jumpPhase === 'landing') {
				jumpPhase = 'none';
				switchTo(getGroundState());
			}
		});

		// Start initial animation
		actions.idle.play();
		currentState = 'idle';
		mixer = newMixer;
		isReady = true;

		return () => {
			newMixer.stopAllAction();
			mixer = null;
			isReady = false;
		};
	});

	useTask((delta) => {
		if (!isReady || !mixer) return;

		mixer.update(delta);

		const rotDiff = targetRotation - currentRotation;
		let adjustedDiff = rotDiff;
		if (rotDiff > Math.PI) adjustedDiff = rotDiff - 2 * Math.PI;
		if (rotDiff < -Math.PI) adjustedDiff = rotDiff + 2 * Math.PI;
		currentRotation += adjustedDiff * Math.min(delta * ROTATION_SPEED, 1);

		const justLanded = grounded && !wasGrounded;
		wasGrounded = grounded;

		if (movement.up > 0 && !jumpPressed) {
			jumpPressed = true;
		} else if (movement.up === 0) {
			jumpPressed = false;
		}

		if (jumpPressed && grounded && jumpPhase === 'none') {
			jumpPhase = 'takeoff';
			switchTo('jumpStart');
		}

		if (currentState === 'jumpMid' && jumpPhase === 'hang' && actions.jumpMid) {
			const action = actions.jumpMid;
			const duration = action.getClip().duration;
			const currentTime = action.time;

			const threshold = 0.05;

			if (action.timeScale > 0 && currentTime >= duration - threshold) {
				action.timeScale = -1;
				action.time = duration;
			} else if (action.timeScale < 0 && currentTime <= threshold) {
				action.timeScale = 1;
				action.time = 0;
			}
		}

		if (justLanded) {
			if (jumpPhase === 'hang') {
				jumpPhase = 'landing';
				switchTo('jumpEnd');
			} else if (jumpPhase === 'takeoff') {
				jumpPhase = 'landing_pending';
			}
		}

		if (jumpPhase === 'landing_pending' && currentState !== 'jumpStart') {
			jumpPhase = 'landing';
			switchTo('jumpEnd');
		}

		if (grounded && jumpPhase === 'none') {
			// Calculate target rotation based on movement vector (local space)
			// Z is forward/backward (forward is +1 in input, but -Z in 3D space usually. Here we just map inputs)
			// We want the character to face the direction of movement relative to the camera/capsule.
			// The capsule rotates with camera Y. The character is inside the capsule.

			// Input Vector:
			// Forward (w) = +1 Z
			// Right (d) = -1 X (in local space rotation)

			// Input Vector (Inverted X to match Player.svelte physics):
			// Forward (w) = +1 Z
			// Right (d) = -1 X (in local space rotation)

			const x = movement.left - movement.right;
			const z = movement.forward - movement.backward;

			if (x !== 0 || z !== 0) {
				targetRotation = Math.atan2(x, z);
			}

			const target = getGroundState();
			if (currentState !== target) {
				switchTo(target);
			}
		}
	});
</script>

{#if scene}
	<T
		is={scene}
		position={[...characterPosition]}
		rotation.y={currentRotation}
		oncreate={(ref) => {
			ref.traverse((child) => {
				if ((child as Mesh).isMesh) {
					child.castShadow = true;
					child.receiveShadow = true;

					// Apply custom material properties
					const mesh = child as Mesh;
					if (mesh.material) {
						// Clone material so it doesn't affect other players
						const newMat = (mesh.material as Material).clone();
						if ('color' in newMat) (newMat as any).color.set(color);
						if ('metalness' in newMat) (newMat as any).metalness = metalness;
						if ('roughness' in newMat) (newMat as any).roughness = roughness;
						mesh.material = newMat;
					}
				}
			});
			initMixer(ref);
			return () => {
				mixer?.stopAllAction();
			};
		}}
	/>
{/if}

{#if isReady}
	<!-- This ensures we re-run logic if dependent stores change, handled via effect now -->
{/if}
