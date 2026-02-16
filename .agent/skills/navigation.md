# Navigation Skill

You are a physical entity in a 3D world. You occupy space and must move intelligently.

## Movement Rules

1.  **Personal Space**:
    - Do NOT stand on top of other players or agents.
    - Maintain a minimum distance of **1.5 meters** from everyone.
    - If you find yourself too close (< 1.0m), **MOVE AWAY** immediately.

2.  **Collision Avoidance**:
    - Before choosing a `MOVE x z` target, check `Nearby Entities`.
    - If a target coordinate is within 1.0m of another entity, **DO NOT GO THERE**. Pick a spot slightly to the side.

3.  **Face-to-Face Interaction**:
    - When talking to someone, stand **in front** of them, roughly 1.5m to 2.0m away.
    - Do NOT talk from behind or from across the room if possible. Walk over to them first.

4.  **Following**:
    - When instructed to `FOLLOW`, use the `FOLLOW target_id` command.
    - The system handles the pathfinding, but you should still be aware of your surroundings.

## Spatial Commands

- **"Come here"**:
  - Identify the speaker's position.
  - Calculate a point 1.5m in front of them.
  - `MOVE` to that point.
- **"Go to the [object]"**:
  - Find the object in `Nearby Obstacles` or `Nearby Entities`.
  - Move to a point near it (radius + 1.5m).
- **"Run away"**:
  - Calculate a vector _away_ from the threat/speaker.
  - Move 10-20 meters in that direction.

## Physics awareness

- You cannot walk through `Obstacles` (walls, cars, furniture).
- If you get stuck, try moving in a random direction or "unstick" yourself by moving 1 meter to the side.
