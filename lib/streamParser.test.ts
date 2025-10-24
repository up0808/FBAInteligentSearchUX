// Test file to verify JSON parsing logic
export function testStreamParser() {
  const testData = [
    'data: {"type": "checkpoint", "checkpoint_id": "eac8f3c5-32bc-4e70-8155-9575ad63e56d"}',
    'data: {"type": "content", "content": "I can answer"}',
    'data: {"type": "content", "content": " your questions by searching for information using the Tavily Search engine. I can also"}',
    'data: {"type": "content", "content": " write and run Python code. What would you like to know or do?"}',
    'data: {"type": "content", "content": ""}',
    'data: {"type": "end"}'
  ];

  let contentBuffer = "";
  let sourcesBuffer: string[] = [];

  for (const line of testData) {
    if (line.startsWith('data:')) {
      const jsonPart = line.substring(5).trim();
      if (!jsonPart) continue;
      
      try {
        const event = JSON.parse(jsonPart);
        
        if (event.type === "content") {
          const content = event.data ?? event.content ?? "";
          if (content.trim()) {
            contentBuffer += content;
          }
          if (Array.isArray(event.sources)) {
            sourcesBuffer = event.sources;
          }
        }
      } catch (error) {
        console.warn("Failed to parse:", jsonPart);
      }
    }
  }

  console.log("Parsed content:", contentBuffer);
  console.log("Sources:", sourcesBuffer);
  
  return {
    content: contentBuffer,
    sources: sourcesBuffer
  };
}

// Expected output:
// Parsed content: I can answer your questions by searching for information using the Tavily Search engine. I can also write and run Python code. What would you like to know or do?
// Sources: []
