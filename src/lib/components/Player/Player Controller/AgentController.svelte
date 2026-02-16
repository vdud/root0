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

	// Raycasting for Physics Awareness (Cliffs & Obstacles)
	const { world } = useRapier();
	import { useRapier } from '@threlte/rapier';
	import { Ray } from '@dimforge/rapier3d-compat';

	// Debug Visuals
	let cliffArrow: ArrowHelper;
	let obstacleArrow: ArrowHelper;

	useTask((delta) => {
		if (!object || !camera.current) return;

		// 1. Update Camera
		const offset = idealOffset.clone().applyQuaternion(object.quaternion).add(object.position);
		const lookAt = idealLookAt.clone().applyQuaternion(object.quaternion).add(object.position);
		currentPos.lerp(offset, 0.1);
		currentLook.lerp(lookAt, 0.1);
		camera.current.position.copy(currentPos);
		camera.current.lookAt(currentLook);

		// 2. Physics-Based Environment Sensing (Rapier)
		// We use the physics world to detect actual colliders (ground, walls, etc.)
		object.getWorldPosition(currentPos);
		object.getWorldDirection(rayDir);
		rayDir.normalize();

		// A. Cliff Detection (Don't fall off!)
		// Cast a ray downwards from a point slightly in front of the agent
		const scanDist = 1.0; // How far ahead to check
		const cliffOrigin = currentPos.clone().add(rayDir.clone().multiplyScalar(scanDist));
		cliffOrigin.y += 1.0; // Start slightly above current level
		const downDir = { x: 0, y: -1, z: 0 };

		const cliffRay = new Ray(cliffOrigin, downDir);
		// Cast down. If we hit nothing within a reasonable distance (e.g. 2m), it's a cliff.
		// Note: The ground should be within ~1m + 1m origin offset = 2m.
		const cliffHit = world.castRay(cliffRay, 3.0, true);

		let cliffDetected = false;
		if (!cliffHit) {
			cliffDetected = true;
			// console.warn('⚠️ Cliff detected! Stopping.');
		}

		// B. Obstacle Detection (Don't walk into walls)
		// Cast a ray forward from center mass
		const obstacleOrigin = currentPos.clone();
		obstacleOrigin.y += 0.5; // Center mass
		const obstacleRay = new Ray(obstacleOrigin, rayDir);
		const obstacleHit = world.castRay(obstacleRay, 1.5, true); // Check 1.5m ahead

		let obstacleDetected = false;
		if (obstacleHit && obstacleHit.timeOfImpact < 1.0) {
			obstacleDetected = true;
			// console.warn('⚠️ Obstacle detected! Stopping.');
		}

		// Reflex Action: Override Movement
		if (cliffDetected || obstacleDetected) {
			// Stop forward movement immediately
			if (movement.forward > 0) movement.forward = 0;

			// If it's an obstacle, maybe we can still move backward?
			// But for cliff, definitely stop forward.
			// For now, safety first: kill forward momentum.
		}

		// Visual Debug arrows
		if (!cliffArrow) {
			cliffArrow = new ArrowHelper(new Vector3(0, -1, 0), cliffOrigin, 1, 0xffff00);
			scene.add(cliffArrow);
			obstacleArrow = new ArrowHelper(rayDir, obstacleOrigin, 1, 0xff00ff);
			scene.add(obstacleArrow);
		} else {
			cliffArrow.position.copy(cliffOrigin);
			cliffArrow.setColor(cliffDetected ? 0xff0000 : 0x00ff00);

			obstacleArrow.position.copy(obstacleOrigin);
			obstacleArrow.setDirection(rayDir);
			obstacleArrow.setColor(obstacleDetected ? 0xff0000 : 0x00ff00);
		}

		// 3. Update Vision (Legacy Raycaster for visual objects/entities, not physics)
		// ... (Original logic kept for entity detection if needed, or we can merge)
		// For now keeping existing logic for 'vision' state
		raycaster.set(rayOrigin, rayDir);
		const intersects = raycaster.intersectObjects(scene.children, true);
		let nearestDist = 999;
		for (const hit of intersects) {
			if (hit.distance < 0.5) continue;
			if (hit.object.userData.isPlayer) continue;
			nearestDist = hit.distance;
			break;
		}

		// Update Network State
		network.vision.obstacleDistance = nearestDist;
		network.vision.blocked = nearestDist < 2.0 || obstacleDetected || cliffDetected;

		// ... (Legacy ArrowHelper update removed/merged above if desired,
		// but let's keep the new ones separate for clarity.
		// Set existing arrowHelper to null to avoid conflict or just let it be)
	});
</script>
