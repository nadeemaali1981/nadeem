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
    if (line.includes('"source"') && line.includes('USER')) {
      try {
        const d = JSON.parse(line);
        if (d.source === 'USER') {
          userMsgs.push(d);
        }
      } catch(e) {}
    }
  }

  console.log('Total USER msgs:', userMsgs.length);
  const last = userMsgs.slice(-5);
  last.forEach((m, idx) => {
    console.log(`\n--- MSG ${idx} ---`);
    console.log(JSON.stringify(m).substring(0, 500));
  });
}

main();
