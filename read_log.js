const fs = require('fs');
const readline = require('readline');

async function main() {
  const fileStream = fs.createReadStream('C:/Users/NADEEM/.gemini/antigravity/brain/0517aadf-5b72-4c4d-a0bb-a1be839ae83e/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const userMsgs = [];
  for await (const line of rl) {
    if (line.includes('USER_EXPLICIT')) {
      try {
        const d = JSON.parse(line);
        userMsgs.push(d);
      } catch(e) {}
    }
  }

  console.log('Total USER_EXPLICIT msgs:', userMsgs.length);
  const last = userMsgs.slice(-4);
  last.forEach((m, idx) => {
    console.log(`\n=== MSG ${idx} (step ${m.step_index}, ${m.created_at}) ===`);
    console.log(m.content);
  });
}

main();
