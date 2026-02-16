<script lang="ts">
	import { useThrelte, useTask } from '@threlte/core';
	import type { AgentCommand } from '$lib/network/AgentProtocol';
	import { network } from '$lib/network/network.svelte';
	import { Vector3, Quaternion, Euler, Raycaster, ArrowHelper } from 'three';

	let { movement = $bindable(), object } = $props();
	const { camera, scene } = useThrelte();

	// Vision System
	const raycaster = new Raycaster();
	const rayOrigin = new Vector3();
	const rayDir = new Vector3();
	let arrowHelper: ArrowHelper;

	// Agent State
	let targetPosition = $state<Vector3 | null>(null);
	let targetRotation = $state<number | null>(null);

	// Camera Config
	const idealOffset = new Vector3(0, 5, -8);
	const idealLookAt = new Vector3(0, 0, 0);
	const currentPos = new Vector3();
	const currentLook = new Vector3();
	let isInitialized = false;

	// Command Handler

	function handleCommand(cmd: any) {
		// console.log('%c🤖 Agent Controller Received:', 'background: #222; color: #bada55', cmd);

		// Visual Feedback for debug
		if (typeof window !== 'undefined') {
			const el = document.getElementById('debug-overlay');
			if (el) el.innerText = `Last Command: ${cmd.type || cmd.action || 'Unknown'}`;
		}

		// Normalize Command
		let type = cmd.type;
		let payload = cmd.payload;

		// Handle "action" format (Hallucination fallback)
		if (!type && cmd.action) {
			type = cmd.action; // e.g. "turn", "move"
		}
		// Handle direct payload (Hallucination fallback)
		if (!payload) {
			payload = cmd; // The whole object might be the payload
		}

		if (type === 'move' || type === 'walk' || type === 'run') {
			if (payload.forward !== undefined) movement.forward = payload.forward;
			if (payload.backward !== undefined) movement.backward = payload.backward;
			if (payload.left !== undefined) movement.left = payload.left;
			if (payload.right !== undefined) movement.right = payload.right;
			if (payload.up !== undefined) movement.up = payload.up;
			// Handle simple "velocity" object hallucination
			if (payload.velocity && payload.velocity.z < 0) movement.forward = 1;
		} else if (type === 'look' || type === 'turn') {
			if (payload.rotation !== undefined && object) {
				object.rotation.y = payload.rotation;
			}
			// Handle "direction" hallucination
			if (payload.direction === 'left' && object) object.rotation.y += 0.5;
			if (payload.direction === 'right' && object) object.rotation.y -= 0.5;
			if (payload.direction === 'back' && object) object.rotation.y += 3.14;
		}
	}

	// Register with Network
	$effect(() => {
		network.registerAgentController(handleCommand);
		return () => {
			network.registerAgentController(() => {});
		};
	});

	// Initialize camera immediately when object becomes available
	$effect(() => {
		if (object && camera.current && !isInitialized) {
			// Hard snap to initial position immediately
			const offset = idealOffset.clone().applyQuaternion(object.quaternion).add(object.position);
			const look = object.position.clone().add(idealLookAt);

			currentPos.copy(offset);
			currentLook.copy(look);

			camera.current.position.copy(currentPos);
			camera.current.lookAt(currentLook);

			isInitialized = true;
		}
	});

	useTask((delta) => {
		if (!object || !camera.current) return;

		// 1. Update Camera
		const offset = idealOffset.clone().applyQuaternion(object.quaternion).add(object.position);
		const lookAt = idealLookAt.clone().applyQuaternion(object.quaternion).add(object.position);
		currentPos.lerp(offset, 0.1);
		currentLook.lerp(lookAt, 0.1);
		camera.current.position.copy(currentPos);
		camera.current.lookAt(currentLook);

		// 2. Update Vision (Raycast)
		object.getWorldPosition(rayOrigin);
		rayOrigin.y += 0.5; // Raise eye level
		object.getWorldDirection(rayDir);
		rayDir.normalize();

		raycaster.set(rayOrigin, rayDir);
		// Intersect against everything in the scene
		const intersects = raycaster.intersectObjects(scene.children, true);

		// Find closest non-player hit
		let nearestDist = 999;
		for (const hit of intersects) {
			if (hit.distance < 0.5) continue; // Ignore self/too close
			if (hit.object.userData.isPlayer) continue; // Ignore other players (optional)

			// If we hit something significant
			nearestDist = hit.distance;
			break;
		}

		// Update Network State
		network.vision.obstacleDistance = nearestDist;
		network.vision.blocked = nearestDist < 2.0;

		// Visual Debug
		if (!arrowHelper) {
			arrowHelper = new ArrowHelper(rayDir, rayOrigin, 2, 0xff0000);
			scene.add(arrowHelper);
		} else {
			arrowHelper.position.copy(rayOrigin);
			arrowHelper.setDirection(rayDir);
			arrowHelper.setColor(nearestDist < 2.0 ? 0xff0000 : 0x00ff00);
		}
	});
</script>
