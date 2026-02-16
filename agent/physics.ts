export interface Point3D {
	x: number;
	y: number;
	z: number;
}

export interface Obstacle {
	id: string;
	position: Point3D;
	radius: number;
	[key: string]: any;
}

export class Raycaster {
	origin: Point3D;
	direction: Point3D;
	maxDistance: number;

	constructor(origin: Point3D, direction: Point3D, maxDistance: number = 5.0) {
		this.origin = origin;
		this.direction = this.normalize(direction);
		this.maxDistance = maxDistance;
	}

	private normalize(v: Point3D): Point3D {
		const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
		if (len === 0) return { x: 0, y: 0, z: 0 };
		return { x: v.x / len, y: v.y / len, z: v.z / len };
	}

	/**
	 * Checks for collisions with a list of obstacles.
	 * Starts from the origin and moves along the direction vector.
	 * Returns the obstacle if a collision is detected within maxDistance.
	 */
	cast(obstacles: Obstacle[]): Obstacle | null {
		// Simple sphere/circle intersection check
		// We treat obstacles as cylinders/circles on the XZ plane for movement logic

		let closestObstacle: Obstacle | null = null;
		let closestDist = this.maxDistance;

		for (const obs of obstacles) {
			// Project obstacle to ray
			// Vector from Ray Origin to Obstacle Center
			const tox = obs.position.x - this.origin.x;
			const toz = obs.position.z - this.origin.z;

			// Project onto direction vector (dot product)
			const t = tox * this.direction.x + toz * this.direction.z;

			// Closest point on the ray to the obstacle center
			let cx = this.origin.x + this.direction.x * t;
			let cz = this.origin.z + this.direction.z * t;

			// If the projection is behind the ray, clamp to origin
			if (t < 0) {
				cx = this.origin.x;
				cz = this.origin.z;
			}
			// If projection is beyond max distance, clamp to end
			else if (t > this.maxDistance) {
				cx = this.origin.x + this.direction.x * this.maxDistance;
				cz = this.origin.z + this.direction.z * this.maxDistance;
			}

			// Distance from closest point on ray to obstacle center
			const dx = cx - obs.position.x;
			const dz = cz - obs.position.z;
			const distSq = dx * dx + dz * dz;

			// Check if within radius
			// We add a small buffer (0.5m) to the radius for agent body size
			const radius = obs.radius + 0.5;

			if (distSq < radius * radius) {
				// Collision detected!
				// Calculate distance along ray to collision point
				// Approximate: t - distance to intersection
				if (t < closestDist && t >= 0) {
					closestDist = t;
					closestObstacle = obs;
				}
			}
		}

		return closestObstacle;
	}

	/**
	 * Checks if the ray hits the "World Edge" (Cliff Detection)
	 * Returns true if the ray goes out of bounds.
	 */
	checkCliff(worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
		const targetX = this.origin.x + this.direction.x * this.maxDistance;
		const targetZ = this.origin.z + this.direction.z * this.maxDistance;

		if (
			targetX < worldBounds.minX ||
			targetX > worldBounds.maxX ||
			targetZ < worldBounds.minZ ||
			targetZ > worldBounds.maxZ
		) {
			return true;
		}
		return false;
	}
}
