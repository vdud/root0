<script lang="ts">
	import { agentManager } from '$lib/agent/AgentManager.svelte.ts';
	import { web3 } from '$lib/web3/web3.svelte';
	import { onMount } from 'svelte';
	import { fade, fly, slide } from 'svelte/transition';

	$effect(() => {
		// console.log('[Dashboard] World Agents Update:', $state.snapshot(agentManager.worldAgents));
		agentManager.worldAgents.forEach((a) => {
			// console.log(`[Dashboard] Agent ${a.name} (${a.id}) Logs:`, $state.snapshot(a.logs).length);
		});
	});

	let selectedAgentId = $state<string | null>(null);
	let isCreating = $state(false);
	let activeTab = $state<'factory' | 'world'>('factory');

	// Form State
	let newName = $state('');
	let newPurpose = $state('');
	let newBehaviour = $state('Neutral');

	function handleCreate() {
		if (!newName || !newPurpose) return;
		agentManager.addAgent({
			name: newName,
			purpose: newPurpose,
			behaviour: newBehaviour
		});
		isCreating = false;
		newName = '';
		newPurpose = '';
		newBehaviour = 'Neutral';
	}

	function handleSelect(id: string) {
		selectedAgentId = id;
	}

	function handleStart(id: string) {
		agentManager.startAgent(id);
	}

	function handleStop(id: string) {
		agentManager.stopAgent(id);
	}

	function handleDelete(e: MouseEvent, id: string) {
		e.preventDefault();
		e.stopPropagation();
		if (confirm('Are you sure you want to delete this agent?')) {
			agentManager.removeAgent(id);
			if (selectedAgentId === id) selectedAgentId = null;
		}
	}

	let globalLogs = $state<string[]>([]);

	onMount(() => {
		const handleLog = (e: any) => {
			const { agentId, message, timestamp } = e.detail;
			const timeStr = new Date(timestamp).toLocaleTimeString();
			globalLogs = [`[${timeStr}] [${agentId?.slice(0, 8)}] ${message}`, ...globalLogs].slice(
				0,
				50
			);
		};
		window.addEventListener('agent-debug-log', handleLog);
		return () => window.removeEventListener('agent-debug-log', handleLog);
	});
</script>

{#if !web3.isConnected}
	<div
		class="min-h-screen pt-36 pb-12 px-6 md:px-12 text-gray-100 relative overflow-hidden flex flex-col items-center justify-center"
	>
		<!-- Background Ambient Textures -->
		<div
			class="absolute top-0 left-0 w-full h-[500px] bg-purple-900/20 blur-[120px] -z-10 pointer-events-none"
		></div>
		<div
			class="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-900/10 blur-[100px] -z-10 pointer-events-none"
		></div>

		<div
			class="max-w-md w-full bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-8 text-center shadow-2xl"
		>
			<div
				class="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10"
			>
				<span class="text-3xl">🔒</span>
			</div>
			<h2 class="text-2xl font-bold text-white mb-2">Access Restricted</h2>
			<p class="text-gray-400 mb-8">Please connect your wallet to access the Command Center.</p>

			<button
				class="w-full px-6 py-3 bg-gradient-to-red from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-purple-900/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
				onclick={() => web3.open()}
			>
				<span>⚡</span> Connect Wallet
			</button>
		</div>
	</div>
{:else}
	<div class="min-h-screen pt-36 pb-12 px-6 md:px-12 text-gray-100 relative overflow-hidden">
		<!-- Background Ambient Textures -->
		<div
			class="absolute top-0 left-0 w-full h-[500px] bg-purple-900/20 blur-[120px] -z-10 pointer-events-none"
		></div>
		<div
			class="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-900/10 blur-[100px] -z-10 pointer-events-none"
		></div>

		<header
			class="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6"
		>
			<div>
				<h1 class="text-4xl md:text-5xl font-bold tracking-tight mb-2">
					<span
						class="bg-clip-text text-transparent bg-gradient-to-r from-purple-300 via-purple-100 to-white"
					>
						Command Center
					</span>
				</h1>
				<p class="text-gray-400 text-lg font-light">
					Manage your autonomous agents and observe the metaverse.
				</p>
			</div>

			<div class="flex items-center gap-6">
				<!-- Tabs -->
				<div class="flex p-1 bg-white/5 backdrop-blur-md rounded-xl border border-white/10">
					<button
						class="px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 cursor-pointer {activeTab ===
						'factory'
							? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
							: 'text-gray-400 hover:text-white hover:bg-white/5'}"
						onclick={() => (activeTab = 'factory')}
					>
						My Factory
					</button>
					<button
						class="px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 cursor-pointer flex items-center gap-2 {activeTab ===
						'world'
							? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
							: 'text-gray-400 hover:text-white hover:bg-white/5'}"
						onclick={() => (activeTab = 'world')}
					>
						World View
						<span
							class="bg-black/30 px-2 py-0.5 rounded-full text-xs text-purple-200 border border-purple-500/20"
						>
							{agentManager.worldAgents.length}
						</span>
					</button>
				</div>

				{#if activeTab === 'factory'}
					<button
						class="px-6 py-3 bg-white text-black hover:bg-gray-200 rounded-xl font-bold transition-all duration-300 transform hover:scale-105 shadow-xl shadow-white/10 flex items-center gap-2 cursor-pointer"
						onclick={() => (isCreating = true)}
					>
						<span>+</span> Create Agent
					</button>
				{/if}
			</div>
		</header>

		{#if isCreating}
			<div
				class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[2000]"
				transition:fade={{ duration: 200 }}
			>
				<div
					class="bg-[#0f0f0f] border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
					transition:fly={{ y: 20, duration: 300 }}
				>
					<div class="p-6 border-b border-gray-800 bg-gray-900/50">
						<h2 class="text-xl font-bold text-white">Design Your Agent</h2>
						<p class="text-sm text-gray-500 mt-1">Configure your new autonomous entity.</p>
					</div>

					<div class="p-6 space-y-6">
						<div>
							<label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
								>Name</label
							>
							<input
								type="text"
								bind:value={newName}
								class="w-full bg-black/50 border border-gray-800 rounded-lg p-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all placeholder:text-gray-700"
								placeholder="e.g. Butler Bot 3000"
							/>
						</div>

						<div>
							<label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
								>Purpose</label
							>
							<textarea
								bind:value={newPurpose}
								class="w-full bg-black/50 border border-gray-800 rounded-lg p-3 text-white h-24 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all resize-none placeholder:text-gray-700"
								placeholder="Describe the agent's primary function and personality..."
							></textarea>
						</div>

						<div>
							<label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
								>Behaviour Model</label
							>
							<div class="relative">
								<select
									bind:value={newBehaviour}
									class="w-full bg-black/50 border border-gray-800 rounded-lg p-3 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none appearance-none cursor-pointer"
								>
									<option value="Neutral">Neutral</option>
									<option value="Friendly">Friendly</option>
									<option value="Aggressive">Aggressive</option>
									<option value="Busy">Busy</option>
								</select>
								<div
									class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"
								>
									▼
								</div>
							</div>
						</div>
					</div>

					<div class="p-6 border-t border-gray-800 bg-gray-900/30 flex justify-end gap-3">
						<button
							class="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors font-medium text-sm cursor-pointer"
							onclick={() => (isCreating = false)}
						>
							Cancel
						</button>
						<button
							class="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg shadow-lg shadow-purple-900/30 font-semibold text-sm transition-all transform active:scale-95 cursor-pointer"
							onclick={handleCreate}
						>
							Create Entity
						</button>
					</div>
				</div>
			</div>
		{/if}

		{#if activeTab === 'factory'}
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-8" in:fade={{ duration: 300 }}>
				<!-- Sidebar: Agent List -->
				<div class="lg:col-span-4 flex flex-col gap-4">
					<div
						class="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-1 h-[calc(100vh-280px)] overflow-hidden flex flex-col"
					>
						<div class="p-4 pb-2">
							<h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">
								Available Units
							</h3>
							<button
								class="text-xs text-purple-400 hover:text-white underline cursor-pointer"
								onclick={() => agentManager.hardResync()}
							>
								Sync Fleet
							</button>
						</div>

						<div class="flex-1 overflow-y-auto px-2 pb-2 space-y-2 custom-scrollbar">
							{#each agentManager.agents as agent (agent.id)}
								<button
									class="w-full text-left p-4 rounded-xl transition-all duration-200 border relative group overflow-hidden cursor-pointer {selectedAgentId ===
									agent.id
										? 'bg-purple-900/20 border-purple-500/50 shadow-inner'
										: 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'}"
									onclick={() => handleSelect(agent.id)}
								>
									{#if selectedAgentId === agent.id}
										<div
											class="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-transparent bg-opacity-20 pointer-events-none"
										></div>
										<div
											class="absolute left-0 top-0 bottom-0 w-1 bg-purple-500 animate-pulse"
										></div>
									{/if}

									<div class="flex justify-between items-center relative z-10">
										<span class="font-bold text-lg text-gray-100">{agent.name}</span>
										<span class="relative flex h-2.5 w-2.5">
											<span
												class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 {agent.status ===
												'running'
													? 'bg-green-400'
													: 'bg-gray-500 hidden'}"
											></span>
											<span
												class="relative inline-flex rounded-full h-2.5 w-2.5 {agent.status ===
												'running'
													? 'bg-green-500'
													: 'bg-gray-600'}"
											></span>
										</span>
									</div>
									<p class="text-sm text-gray-400 truncate mt-1 relative z-10">{agent.purpose}</p>
								</button>
							{/each}

							{#if agentManager.agents.length === 0}
								<div class="flex flex-col items-center justify-center py-20 text-gray-600">
									<div class="text-4xl mb-4 opacity-30">🕸️</div>
									<p class="text-sm">Factory is empty.</p>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Main Area: Agent Details -->
				<div class="lg:col-span-8">
					<div
						class="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-8 h-[calc(100vh-280px)] flex flex-col relative overflow-hidden group"
					>
						{#if selectedAgentId}
							{@const agent = agentManager.agents.find((a) => a.id === selectedAgentId)}
							{#if agent}
								<!-- Header of Details -->
								<div
									class="flex justify-between items-start mb-8 relative z-10 border-b border-gray-800 pb-6"
								>
									<div>
										<h2 class="text-3xl font-bold text-white flex items-center gap-3">
											{agent.name}
											<span
												class="text-xs font-bold px-2 py-1 rounded border uppercase tracking-wider {agent.status ===
												'running'
													? 'border-green-500/30 text-green-400 bg-green-500/10'
													: 'border-gray-700 text-gray-500 bg-gray-800/30'}"
											>
												{agent.status}
											</span>
										</h2>
										<p class="text-gray-400 mt-2 max-w-2xl">{agent.purpose}</p>
									</div>

									<div class="flex gap-2">
										{#if agent.status === 'stopped'}
											<button
												class="px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold shadow-lg shadow-green-900/20 transition-all flex items-center gap-2 cursor-pointer"
												onclick={() => handleStart(agent.id)}
											>
												<span class="text-xs">▶</span> Initialize
											</button>
										{:else}
											<button
												class="px-6 py-2.5 bg-red-900/80 hover:bg-red-800 text-red-100 border border-red-700/50 rounded-lg font-semibold transition-all flex items-center gap-2 cursor-pointer"
												onclick={() => handleStop(agent.id)}
											>
												<span class="text-xs">⏹</span> Terminate
											</button>
										{/if}

										<button
											type="button"
											class="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
											onclick={(e) => handleDelete(e, agent.id)}
											title="Delete Agent"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="20"
												height="20"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
												></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg
											>
										</button>
									</div>
								</div>

								<!-- Dashboard Grid -->
								<div class="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0 relative z-10">
									<!-- Stats Panel -->
									<div class="bg-black/20 rounded-xl p-5 border border-white/5 flex flex-col gap-4">
										<h3
											class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-2"
										>
											<span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Live Telemetry
										</h3>

										<div class="space-y-4 mt-2">
											<div class="flex justify-between items-center p-3 bg-white/5 rounded-lg">
												<span class="text-gray-400 text-sm">Mode</span>
												<span class="text-white font-medium bg-white/10 px-2 py-0.5 rounded text-sm"
													>{agent.behaviour}</span
												>
											</div>
											<div class="flex justify-between items-center p-3 bg-white/5 rounded-lg">
												<span class="text-gray-400 text-sm">Wallet Address</span>
												<span class="text-gray-300 font-mono text-xs">0x71C...39A2</span>
											</div>
											<div
												class="flex justify-between items-center p-3 bg-gradient-to-r from-green-900/10 to-transparent border border-green-500/10 rounded-lg"
											>
												<span class="text-green-400/80 text-sm">Token Balance</span>
												<span class="text-green-400 font-mono font-bold tracking-tight"
													>1,240.50 ROOT</span
												>
											</div>
										</div>

										<div class="mt-auto pt-4 border-t border-gray-800/50">
											<div class="text-xs text-gray-500 mb-2">Current Activity</div>
											<div
												class="text-sm text-purple-200/90 italic p-3 bg-purple-900/10 border border-purple-500/10 rounded-lg"
											>
												{agent.status === 'running'
													? 'Scanning environment for interactive objects...'
													: 'System suspended. Waiting for initialization.'}
											</div>
										</div>
									</div>

									<!-- Logs Console -->
									<div
										class="bg-[#0c0c0c] rounded-xl border border-gray-800 flex flex-col overflow-hidden shadow-inner"
									>
										<div
											class="px-4 py-2 border-b border-gray-800 bg-gray-900/80 flex items-center gap-2"
										>
											<div class="flex gap-1.5">
												<div class="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
												<div class="w-2.5 h-2.5 rounded-full bg-yellow-500/50"></div>
												<div class="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
											</div>
											<span class="text-xs font-mono text-gray-500 ml-2">terminal.log</span>
										</div>
										<div
											class="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs custom-scrollbar"
										>
											{#each agent.logs as log}
												<div class="break-words text-gray-300 flex gap-2">
													<span class="text-green-500/50 select-none">›</span>
													<span class="opacity-90">{log}</span>
												</div>
											{/each}
											{#if agent.logs.length === 0}
												<div class="text-gray-700 italic">No logs generated.</div>
											{/if}
											<div class="animate-pulse w-2 h-4 bg-gray-600 mt-1"></div>
										</div>
									</div>
								</div>
							{/if}
						{:else}
							<div class="flex flex-col items-center justify-center h-full text-gray-600">
								<div
									class="w-24 h-24 rounded-full bg-gray-800/50 flex items-center justify-center mb-6 border border-dashed border-gray-700"
								>
									<span class="text-4xl opacity-50">⚡</span>
								</div>
								<p class="text-lg font-medium text-gray-500">
									Select a unit from the factory to configure.
								</p>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<!-- World View Tab -->
			<div
				class="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-8 h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar"
				in:fade={{ duration: 300 }}
			>
				<div class="flex justify-between items-end mb-8">
					<div>
						<h2 class="text-2xl font-bold text-white">Metaverse Overview</h2>
						<p class="text-gray-400 mt-1 text-sm">
							Real-time tracking of all entities tagged as <code>isAgent: true</code>
						</p>
					</div>
					<div
						class="text-xs text-gray-500 font-mono bg-black/30 px-3 py-1 rounded border border-white/5"
					>
						LIVE CONNECTION
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
					{#each agentManager.worldAgents as wAgent (wAgent.id)}
						<div
							class="bg-[#0f0f0f] border border-gray-800 p-5 rounded-xl flex flex-col gap-3 relative group hover:border-purple-500/40 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-900/10 hover:-translate-y-1"
						>
							<div class="flex justify-between items-start">
								<span
									class="font-bold text-lg text-gray-200 group-hover:text-purple-300 transition-colors"
									>{wAgent.name}</span
								>
								{#if wAgent.isLocal}
									<span
										class="text-[10px] font-bold bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded border border-purple-500/20"
										>LOCAL</span
									>
								{:else}
									<span
										class="text-[10px] font-bold bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20"
										>REMOTE</span
									>
								{/if}
							</div>

							<p class="text-xs text-gray-500 italic line-clamp-2">
								"{wAgent.purpose || 'No purpose defined.'}"
							</p>

							<div class="grid grid-cols-2 gap-2 mt-2">
								<div class="bg-black/40 p-2 rounded border border-white/5">
									<div class="text-[10px] text-gray-600 uppercase">Position</div>
									<div class="text-xs font-mono text-gray-300">
										{wAgent.position.x.toFixed(1)}, {wAgent.position.z.toFixed(1)}
									</div>
								</div>
								<div class="bg-black/40 p-2 rounded border border-white/5">
									<div class="text-[10px] text-gray-600 uppercase">Owner</div>
									<div class="text-xs font-mono text-yellow-500/80 truncate">
										{wAgent.owner ? wAgent.owner.slice(0, 6) + '...' : 'Unknown'}
									</div>
								</div>
							</div>

							<div class="mt-4 pt-4 border-t border-gray-800/50 flex-1 flex flex-col min-h-0">
								<div
									class="text-[10px] text-gray-600 font-bold mb-2 uppercase flex justify-between"
								>
									<span>Brain Feed</span>
									<span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
								</div>
								<div
									class="h-32 overflow-y-auto bg-black p-3 rounded border border-white/5 text-[10px] font-mono text-gray-400 space-y-1 custom-scrollbar"
								>
									{#each wAgent.logs as log}
										<div
											class="break-words border-b border-gray-800/50 pb-1 last:border-0 last:pb-0"
										>
											<span class="text-purple-500/50 mr-1">›</span>{log}
										</div>
									{/each}
									{#if !wAgent.logs || wAgent.logs.length === 0}
										<div class="text-gray-700 italic opacity-50">Waiting for signals...</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}

					{#if agentManager.worldAgents.length === 0}
						<div
							class="col-span-full py-24 text-center text-gray-600 border border-dashed border-gray-800 rounded-2xl bg-black/20"
						>
							<div class="text-5xl mb-4 opacity-50 grayscale">📡</div>
							<p class="text-lg font-medium">No agents detected in the sector.</p>
							<p class="text-sm mt-2 text-gray-500">
								Ensure Docker containers are active and connected to the mesh.
							</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Custom Scrollbar for specific containers */
	.custom-scrollbar::-webkit-scrollbar {
		width: 6px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.2);
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.2);
	}
</style>
