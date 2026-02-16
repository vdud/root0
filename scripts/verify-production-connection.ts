import { HeadlessAgent } from '../src/lib/network/HeadlessAgent';

// Default to production host if not specified
const HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || 'antigravity-server.vdud.partykit.dev';
const ROOM = 'main-room';
const AGENT_NAME = 'Verificator-Bot';

console.log(`\n🔍 STARTING CONNECTION VERIFICATION`);
console.log(`🎯 Target Host: ${HOST}`);
console.log(`🏠 Target Room: ${ROOM}`);
console.log(`🤖 Agent Name: ${AGENT_NAME}`);

async function main() {
	console.log(`\n🔌 Initializing HeadlessAgent...`);
	const agent = new HeadlessAgent(HOST, ROOM, AGENT_NAME);

	// Override socket open to log success
	// We can't easily hook into the socket instance directly before it's created in the constructor,
	// but HeadlessAgent emits logs. Let's see if we can detect connection state.

	console.log(`⏳ Waiting for connection...`);

	// Timeout after 10 seconds
	const timeout = setTimeout(() => {
		console.error(`\n❌ TIMEOUT: Could not connect to ${HOST} within 10 seconds.`);
		console.error(`   - Check if the server is running.`);
		console.error(`   - Check if the URL is correct.`);
		console.error(`   - Check your network connection.`);
		process.exit(1);
	}, 10000);

	// Poll for connection
	const checkInterval = setInterval(() => {
		if (agent.socket && agent.socket.readyState === 1) {
			// 1 = OPEN
			clearTimeout(timeout);
			clearInterval(checkInterval);
			console.log(`\n✅ SUCCESS: Connected to ${HOST}!`);
			console.log(`🚀 Socket ID: ${agent.socket.id}`);

			console.log(`\n📤 Sending test message...`);
			agent.say('Verification Bot is Online!');

			setTimeout(() => {
				console.log(`\n👋 Disconnecting and exiting.`);
				agent.stopLoop();
				agent.socket.close();
				process.exit(0);
			}, 2000);
		}
	}, 500);
}

main().catch((err) => {
	console.error(`\n❌ CRITICAL ERROR:`, err);
	process.exit(1);
});
