import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const FLEET_HOST =
	import.meta.env.VITE_FLEET_URL ||
	(import.meta.env.PROD ? 'http://13.204.77.125:3000' : 'http://127.0.0.1:3000');

export const POST: RequestHandler = async ({ params, request, fetch }) => {
	// console.log(import.meta.env.PROD);
	// console.log('hehe');
	const slug = params.slug; // e.g. "agent/start"
	// console.log('slug', slug);
	const targetUrl = `${FLEET_HOST}/${slug}`;

	// console.log('FLEET_HOST', FLEET_HOST);

	try {
		// console.log(`[FleetProxy] Proxying POST to ${targetUrl}`);
		const body = await request.json();
		const response = await fetch(targetUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});

		let data;
		try {
			data = await response.json();
		} catch (e) {
			console.error('Failed to parse remote response');
			data = { error: 'Invalid response from fleet' };
		}

		return new Response(JSON.stringify(data), {
			status: response.status,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		console.error('Fleet Proxy Error:', err);
		return new Response(JSON.stringify({ error: 'Failed to connect to Fleet Manager' }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const GET: RequestHandler = async ({ params, fetch }) => {
	const slug = params.slug; // "agents"
	const targetUrl = `${FLEET_HOST}/${slug}`;

	try {
		// console.log(`[FleetProxy] Proxying GET to ${targetUrl}`);
		const response = await fetch(targetUrl);
		const data = await response.json();
		// console.log('data', data);
		return new Response(JSON.stringify(data), {
			status: response.status,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		console.error('Fleet Proxy Error (GET):', err);
		return new Response(JSON.stringify({ error: 'Fleet Manager Unreachable' }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
