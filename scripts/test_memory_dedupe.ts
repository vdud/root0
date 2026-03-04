const stopWords = new Set([
	'the',
	'is',
	'at',
	'which',
	'on',
	'and',
	'a',
	'an',
	'in',
	'to',
	'of',
	'for',
	'with',
	'while',
	'are',
	'was',
	'were',
	'be',
	'been',
	'being',
	'have',
	'has',
	'had',
	'do',
	'does',
	'did',
	'but',
	'if',
	'or',
	'because',
	'as',
	'until',
	'while',
	'of',
	'at',
	'by',
	'for',
	'with',
	'about',
	'against',
	'between',
	'into',
	'through',
	'during',
	'before',
	'after',
	'above',
	'below',
	'to',
	'from',
	'up',
	'down',
	'in',
	'out',
	'on',
	'off',
	'over',
	'under',
	'again',
	'further',
	'then',
	'once'
]);

function getJaccardSimilarity(str1: string, str2: string): number {
	const tokenize = (str: string) => {
		return str
			.toLowerCase()
			.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
			.split(/\s+/)
			.filter((w) => w.length > 2 && !stopWords.has(w));
	};

	const set1 = new Set(tokenize(str1));
	const set2 = new Set(tokenize(str2));

	// Debug print tokens
	// console.log(`Tokens 1: ${[...set1].join(', ')}`);
	// console.log(`Tokens 2: ${[...set2].join(', ')}`);

	const intersection = new Set([...set1].filter((x) => set2.has(x)));
	const union = new Set([...set1, ...set2]);

	if (union.size === 0) return 0;
	return intersection.size / union.size;
}

const threshold = 0.4; // Lowered threshold

const examples = [
	{
		name: 'Test 1: Similar dance area context',
		new: 'Staying in the dance area while maintaining the cool vibe despite the drama with Bitch being hostile.',
		existing:
			'Staying in the dance area while Sydney and Leela are friendly, and Bitch is hostile. The vibe is cool despite the drama.',
		expected: true
	},
	{
		name: 'Test 2: Distinct events',
		new: 'I met Bruce Wayne and he was cool.',
		existing: 'I saw a car driving by.',
		expected: false
	},
	{
		name: 'Test 3: Similar vibe check',
		new: 'Staying in the dance area to enjoy the cool vibe with current friends.',
		existing: 'Staying in the dance area while maintaining the cool vibe despite the drama.',
		expected: true
	},
	{
		name: 'Test 4: Similar hostility check (Short text)',
		new: 'Bitch is being hostile to everyone.',
		existing: 'Bitch was hostile to me.',
		expected: true
	},
	{
		name: 'Test 5: Completely different short texts',
		new: 'I love apples.',
		existing: 'I hate bananas.',
		expected: false
	}
];

console.log(`Testing Enhanced Jaccard Similarity (Threshold: ${threshold})\n`);

examples.forEach((ex) => {
	const score = getJaccardSimilarity(ex.new, ex.existing);
	const isDuplicate = score >= threshold;
	const pass = isDuplicate === ex.expected;

	console.log(`${ex.name}:`);
	console.log(`  New: "${ex.new}"`);
	console.log(`  Old: "${ex.existing}"`);
	console.log(`  Score: ${score.toFixed(2)}`);
	console.log(`  Result: ${isDuplicate ? 'DUPLICATE' : 'UNIQUE'}`);
	console.log(`  Pass: ${pass ? '✅' : '❌'}\n`);
});
